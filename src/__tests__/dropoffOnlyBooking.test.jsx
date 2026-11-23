import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  slug: "juans-auto-detailing",
  fetchServices: vi.fn(),
  fetchAvailability: vi.fn(),
  requestBooking: vi.fn(),
}));
vi.mock("../api/services.js", () => ({ fetchServices: mocks.fetchServices }));
vi.mock("../api/bookings.js", () => ({
  fetchAvailability: mocks.fetchAvailability,
  requestBooking: mocks.requestBooking,
  createBooking: vi.fn(),
}));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: {
      id: "tenant-1",
      slug: mocks.slug,
      name: mocks.slug === "juans-auto-detailing" ? "Juan's Auto Detailing" : "Shine Shop",
    },
    config: {
      businessName: mocks.slug === "juans-auto-detailing" ? "Juan's Auto Detailing" : "Shine Shop",
      businessHours: { start: "8:00 AM", end: "7:00 PM" },
      bookingGranularityMin: 60,
      mobileTravelBufferMin: 30,
      timezone: "America/Denver",
    },
  }),
}));

import { BookingFlow } from "../pages/BookingFlow.jsx";

const AFTERNOON = new Date("2026-10-08T19:05:00Z"); // Thu Oct 8, 1:05 PM Denver

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AFTERNOON);
  mocks.slug = "juans-auto-detailing";
  mocks.fetchServices.mockResolvedValue([
    { id: "s1", name: "Exterior Only", price_cents: 7500, duration_min: 90 },
  ]);
  mocks.fetchAvailability.mockResolvedValue([]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-1", status: "pending" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("winter drop-off only (Juan)", () => {
  it("hides the Mobile option, shows the drop-off address, and submits type dropoff", async () => {
    const onConfirm = vi.fn();
    render(<BookingFlow guest onConfirm={onConfirm} />);
    await screen.findByRole("button", { name: /3:00 PM/ });

    expect(screen.queryByRole("button", { name: /^Mobile$/i })).toBeNull();
    expect(screen.queryByText(/Drop-off or Mobile/)).toBeNull();
    expect(screen.getByText(/Drop-off at 900 W Main St #20, Tremonton, UT 84337/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gina Guest" } });
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "4355550101" } });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "2019 Jeep" } });
    fireEvent.click(screen.getByRole("button", { name: /3:00 PM/ }));

    await waitFor(() => expect(mocks.requestBooking).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0]).toMatchObject({ type: "dropoff" });
    expect(mocks.requestBooking.mock.calls[0][0].mobileAddress).toBeFalsy();
  });

  it("other shops still offer Mobile", async () => {
    mocks.slug = "shine";
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /3:00 PM/ });
    expect(screen.getByRole("button", { name: /^Mobile$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Drop-off/i })).toBeTruthy();
  });
});
