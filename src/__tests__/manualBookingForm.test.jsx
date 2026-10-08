import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchServices: vi.fn(), fetchAvailability: vi.fn(), createBooking: vi.fn(), requestBooking: vi.fn(), createVehicle: vi.fn(),
  fetchTenantCustomers: vi.fn(), fetchTenantStaff: vi.fn(), createGuestCustomer: vi.fn(),
}));
vi.mock("../api/services.js", () => ({ fetchServices: mocks.fetchServices }));
vi.mock("../api/bookings.js", () => ({ fetchAvailability: mocks.fetchAvailability, createBooking: mocks.createBooking, requestBooking: mocks.requestBooking }));
vi.mock("../api/vehicles.js", () => ({ createVehicle: mocks.createVehicle }));
vi.mock("../api/profiles.js", () => ({
  fetchTenantCustomers: mocks.fetchTenantCustomers, fetchTenantStaff: mocks.fetchTenantStaff, createGuestCustomer: mocks.createGuestCustomer,
}));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ profile: { id: "owner-1" } }) }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: "shine", name: "Shine Shop" },
    config: { businessHours: { start: "9:00 AM", end: "5:00 PM" }, bookingGranularityMin: 30, mobileTravelBufferMin: 30, timezone: "America/Denver" },
  }),
}));

import { ManualBookingForm } from "../pages/admin/ManualBookingForm.jsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  mocks.fetchServices.mockResolvedValue([{ id: "svc-1", name: "Basic Wash", price_cents: 5000, duration_min: 60 }]);
  mocks.fetchAvailability.mockResolvedValue([]);
  mocks.fetchTenantCustomers.mockResolvedValue([]);
  mocks.fetchTenantStaff.mockResolvedValue([{ id: "owner-1", full_name: "Owner" }]);
  mocks.createGuestCustomer.mockResolvedValue({ id: "p-new" });
  mocks.createVehicle.mockResolvedValue({ id: "v-1" });
  mocks.createBooking.mockResolvedValue({ id: "b-1" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const slot = (t) => screen.queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });

describe("staff Add Booking form: dates and past slots", () => {
  it("in the evening, today is still today in Denver (not tomorrow from UTC)", async () => {
    vi.setSystemTime(new Date("2026-10-09T01:30:00Z")); // 7:30 PM MDT Oct 8
    render(<ManualBookingForm onClose={() => {}} onCreated={() => {}} />);
    await screen.findByText("Thu, Oct 8");
    expect(mocks.fetchAvailability.mock.calls[0][0]).toBe("2026-10-08");
  });

  it("hides slots that already started today, with no extra lead time for staff", async () => {
    vi.setSystemTime(new Date("2026-10-08T19:05:00Z")); // 1:05 PM MDT
    render(<ManualBookingForm onClose={() => {}} onCreated={() => {}} />);
    await waitFor(() => expect(slot("1:30 PM")).toBeTruthy());
    expect(slot("9:00 AM")).toBeNull();
    expect(slot("1:00 PM")).toBeNull();
  });

  it("books a walk-in into the next open slot today as approved, via the staff path", async () => {
    vi.setSystemTime(new Date("2026-10-08T19:05:00Z"));
    const onCreated = vi.fn();
    render(<ManualBookingForm onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() => expect(slot("1:30 PM")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("e.g. Jamie Rivera"), { target: { value: "Jamie Rivera" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 2021 Ford F-150"), { target: { value: "2019 Tacoma" } });
    fireEvent.click(slot("1:30 PM"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mocks.createBooking.mock.calls[0][0]).toMatchObject({ booking_date: "2026-10-08", start_time: "13:30:00", status: "approved", profile_id: "p-new" });
    expect(mocks.requestBooking).not.toHaveBeenCalled();
  });
});
