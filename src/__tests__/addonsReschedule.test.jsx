import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

// Services manager, add-ons and staff reschedule. No Supabase: API is mocked.
const mocks = vi.hoisted(() => ({
  fetchServices: vi.fn(), fetchAllServices: vi.fn(), fetchAddons: vi.fn(),
  createService: vi.fn(), updateService: vi.fn(), createAddon: vi.fn(), updateAddon: vi.fn(),
  fetchAvailability: vi.fn(), requestBooking: vi.fn(), createManualBooking: vi.fn(),
  setBookingServiceAddons: vi.fn(), rescheduleBooking: vi.fn(),
  fetchTenantCustomers: vi.fn(), fetchTenantStaff: vi.fn(),
}));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../api/services.js", () => ({
  fetchServices: mocks.fetchServices, fetchAllServices: mocks.fetchAllServices, fetchAddons: mocks.fetchAddons,
  createService: mocks.createService, updateService: mocks.updateService, createAddon: mocks.createAddon, updateAddon: mocks.updateAddon,
}));
vi.mock("../api/bookings.js", () => ({
  fetchAvailability: mocks.fetchAvailability, requestBooking: mocks.requestBooking, createManualBooking: mocks.createManualBooking,
  setBookingServiceAddons: mocks.setBookingServiceAddons, rescheduleBooking: mocks.rescheduleBooking,
}));
vi.mock("../api/profiles.js", () => ({ fetchTenantCustomers: mocks.fetchTenantCustomers, fetchTenantStaff: mocks.fetchTenantStaff }));
vi.mock("../context/AuthContext.jsx", () => ({ useAuth: () => ({ profile: { id: "owner-1" } }) }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: "shine", name: "Shine Shop" },
    config: {
      businessName: "Shine Shop", businessHours: { start: "9:00 AM", end: "5:00 PM" },
      bookingGranularityMin: 30, mobileTravelBufferMin: 30, timezone: "America/Denver",
    },
  }),
}));

import { BookingFlow } from "../pages/BookingFlow.jsx";
import { ManualBookingForm } from "../pages/admin/ManualBookingForm.jsx";
import { ScheduleTab } from "../pages/admin/ScheduleTab.jsx";
import { RequestsTab } from "../pages/admin/RequestsTab.jsx";
import { ServicesTab, parseCatalogForm } from "../pages/admin/ServicesTab.jsx";
import { InvoiceModal } from "../components/InvoiceModal.jsx";
import { buildBookingAlert } from "../lib/bookingAlert.js";
import { addonTotals, serviceIncludes, addonLabel } from "../lib/addons.js";

const WASH = { id: "svc-1", name: "Basic Wash", price_cents: 5000, duration_min: 60, active: true, sort_order: 1 };
const DETAIL = { id: "svc-2", name: "Full Detail", price_cents: 15000, duration_min: 90, active: true, sort_order: 2 };
const PET = { id: "ad-1", name: "Pet Hair Removal", price_cents: 3500, extra_duration_min: 30, active: true, sort_order: 1 };
const HEAD = { id: "ad-2", name: "Headlight Restoration", price_cents: 4500, extra_duration_min: 60, active: true, sort_order: 2 };

const slot = (t) => screen.queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T19:05:00Z")); // Thu Oct 8, 1:05 PM Denver
  mocks.fetchServices.mockResolvedValue([WASH]);
  mocks.fetchAllServices.mockResolvedValue([WASH, DETAIL]);
  mocks.fetchAddons.mockResolvedValue([PET, HEAD]);
  // 3:00-4:00 PM is taken today
  mocks.fetchAvailability.mockResolvedValue([{ start_time: "15:00:00", duration_min: 60, type: "dropoff" }]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-1" });
  mocks.createManualBooking.mockResolvedValue({ booking_id: "b-1" });
  mocks.setBookingServiceAddons.mockResolvedValue({});
  mocks.rescheduleBooking.mockResolvedValue({});
  mocks.fetchTenantCustomers.mockResolvedValue([]);
  mocks.fetchTenantStaff.mockResolvedValue([]);
  mocks.updateService.mockResolvedValue({});
  mocks.createService.mockResolvedValue({});
  mocks.createAddon.mockResolvedValue({});
  mocks.updateAddon.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("add-on math and labels", () => {
  it("sums any number of add-ons onto the service and labels them", () => {
    const t = addonTotals(WASH, [PET, HEAD], ["ad-1", "ad-2", "ad-1"]);
    expect(t).toMatchObject({ priceCents: 13000, durationMin: 150 });
    expect(addonLabel(PET)).toBe("Pet Hair Removal +$35 (+30 min)");
  });
  it("homepage copy uses services.description and falls back to the tenant file", () => {
    const branding = { serviceDetails: { "Basic Wash": { includes: ["Old copy"] } } };
    expect(serviceIncludes({ ...WASH, description: "Hand wash\n\nTire shine" }, branding)).toEqual(["Hand wash", "Tire shine"]);
    expect(serviceIncludes({ ...WASH, description: "" }, branding)).toEqual(["Old copy"]);
    expect(serviceIncludes({ ...WASH, name: "Renamed", description: "" }, branding)).toEqual([]);
  });
  it("the owner alert lists each add-on and the totals", () => {
    const p = buildBookingAlert({ businessName: "S", service: "Basic Wash", price: "$50", dateKey: "2026-10-08", time: "2:00 PM",
      addons: [PET, HEAD], totalPrice: "$130", totalDuration: "2 hr 30 min" });
    expect(p.add_ons).toBe("Pet Hair Removal +$35 (+30 min); Headlight Restoration +$45 (+60 min)");
    expect(p.total_price).toBe("$130");
    expect(p.total_duration).toBe("2 hr 30 min");
  });
});

describe("customer booking with add-ons", () => {
  it("shows add-on checkboxes, a running total, and recalculates open slots with the full duration", async () => {
    render(<BookingFlow guest onConfirm={() => {}} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy()); // 2:00-3:00 fits before the 3:00 booking
    fireEvent.click(await screen.findByLabelText("Pet Hair Removal +$35 (+30 min)"));
    expect(screen.getByTestId("booking-total").textContent).toMatch(/\$85 · 1 hr 30 min/);
    // 2:00 + 90 min would run into 3:00; 4:00 + 90 would pass closing
    expect(slot("2:00 PM")).toBeNull();
    expect(screen.getByText(/No open time on this day fits Basic Wash plus your add-ons \(1 hr 30 min\)/)).toBeTruthy();
  });

  it("sends the chosen add-on ids to request_booking", async () => {
    const onConfirm = vi.fn();
    mocks.fetchAvailability.mockResolvedValue([]);
    render(<BookingFlow guest onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByLabelText("Headlight Restoration +$45 (+60 min)"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gina Guest" } });
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "5552010001" } });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "2020 Civic" } });
    // 3:00 + 120 = 5:00 fits; 3:30 does not
    expect(slot("3:30 PM")).toBeNull();
    fireEvent.click(slot("3:00 PM"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0].addonIds).toEqual(["ad-2"]);
    expect(onConfirm.mock.calls[0][0].addons).toEqual(["Headlight Restoration"]);
  });
});

describe("staff Add Booking with add-ons", () => {
  it("offers only slots that fit service + add-ons and sends them in one call", async () => {
    const onCreated = vi.fn();
    render(<ManualBookingForm onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Pet Hair Removal +$35 (+30 min)"));
    expect(screen.getByTestId("manual-total").textContent).toMatch(/\$85 · 1 hr 30 min/);
    expect(slot("2:00 PM")).toBeNull();
    expect(slot("1:30 PM")).toBeTruthy(); // 1:30-3:00
    fireEvent.change(screen.getByPlaceholderText("e.g. Jamie Rivera"), { target: { value: "Jamie" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 2021 Ford F-150"), { target: { value: "Tacoma" } });
    fireEvent.click(slot("1:30 PM"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mocks.createManualBooking.mock.calls[0][0]).toMatchObject({ startTime: "13:30:00", addonIds: ["ad-1"], newName: "Jamie" });
  });
});

// Tomorrow (Fri Oct 9): b1 Basic Wash 10:00-11:00, b2 Full Detail + Pet Hair 12:00-2:00 (120 min).
const b1 = { id: "b1", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "10:00:00", duration_min: 60,
  price_cents: 5000, service_id: "svc-1", services: { name: "Basic Wash" }, booking_addons: [] };
const b2 = { id: "b2", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "12:00:00", duration_min: 120,
  price_cents: 18500, service_id: "svc-2", services: { name: "Full Detail" },
  booking_addons: [{ id: "ba-1", addon_id: "ad-1", name: "Pet Hair Removal", price_cents: 3500, extra_duration_min: 30 }] };

describe("Schedule tab", () => {
  const renderSchedule = () => render(<ScheduleTab bookings={[b1, b2]} busyId={null} onAct={() => {}} onRefresh={() => {}} />);

  it("timeline bars block each booking's FULL duration and the list shows add-ons", () => {
    renderSchedule();
    const bars = screen.getAllByTestId("timeline-bar");
    const bar2 = bars.find((b) => b.title.startsWith("Full Detail"));
    expect(bar2.style.width).toBe("25%"); // 120 of the 480-minute day
    expect(bar2.style.left).toBe("37.5%");
    expect(screen.getByText(/Full Detail \+ Pet Hair Removal/)).toBeTruthy();
  });

  it("editing service/add-ons recomputes the total and blocks a longer job that would collide", async () => {
    renderSchedule();
    const row = screen.getByText("Basic Wash").closest("div");
    fireEvent.click(within(row).getByLabelText("Change service / add-ons"));
    await screen.findByTestId("edit-total");
    fireEvent.click(screen.getByLabelText("Headlight Restoration +$45 (+60 min)")); // 10:00-12:00 still fits
    expect(screen.getByTestId("edit-total").textContent).toMatch(/\$95 · 2 hr/);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByLabelText("Pet Hair Removal +$35 (+30 min)")); // 10:00-12:30 hits 12:00
    expect(screen.getByRole("alert").textContent).toMatch(/would overlap Full Detail at 12:00 PM/);
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Pet Hair Removal +$35 (+30 min)"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.setBookingServiceAddons).toHaveBeenCalledWith("b1", { serviceId: "svc-1", addonIds: ["ad-2"] }));
  });

  it("shows the server's message if it rejects the change", async () => {
    mocks.setBookingServiceAddons.mockRejectedValue(new Error("That would overlap another booking (this job is 120 min). Pick another time."));
    renderSchedule();
    fireEvent.click(within(screen.getByText("Basic Wash").closest("div")).getByLabelText("Change service / add-ons"));
    fireEvent.click(await screen.findByLabelText("Headlight Restoration +$45 (+60 min)"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/overlap another booking/)).toBeTruthy();
  });

  it("reschedule offers only open slots for the full duration, excluding the booking itself", async () => {
    const onRefresh = vi.fn();
    render(<ScheduleTab bookings={[b1, b2]} busyId={null} onAct={() => {}} onRefresh={onRefresh} />);
    fireEvent.click(within(screen.getByText(/Full Detail/).closest("div")).getByLabelText("Reschedule"));
    const form = screen.getByTestId("reschedule-form");
    const has = (t) => !!within(form).queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });
    expect(has("9:00 AM")).toBe(false); // 9-11 hits b1
    expect(has("10:30 AM")).toBe(false);
    expect(has("11:00 AM")).toBe(true);
    expect(has("12:00 PM")).toBe(true); // its own slot doesn't block it
    expect(has("3:00 PM")).toBe(true); // 3-5 fits
    expect(has("3:30 PM")).toBe(false); // would run past closing
    fireEvent.click(within(form).getByRole("button", { name: /3:00 PM/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Move to 3:00 PM" }));
    await waitFor(() => expect(mocks.rescheduleBooking).toHaveBeenCalledWith("b2", { bookingDate: "2026-10-09", startTime: "15:00:00" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("reschedule shows the server's rejection", async () => {
    mocks.rescheduleBooking.mockRejectedValue(new Error("Sorry: That would overlap another booking"));
    renderSchedule();
    fireEvent.click(within(screen.getByText(/Full Detail/).closest("div")).getByLabelText("Reschedule"));
    const form = screen.getByTestId("reschedule-form");
    fireEvent.click(within(form).getByRole("button", { name: /3:00 PM/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Move to 3:00 PM" }));
    expect(await within(form).findByText(/would overlap another booking/)).toBeTruthy();
  });
});

describe("Requests tab", () => {
  const req = { id: "r1", status: "pending", type: "dropoff", booking_date: "2026-10-09", start_time: "09:00:00", duration_min: 90,
    price_cents: 8500, services: { name: "Basic Wash" }, profiles: { full_name: "Gina Guest", source: "guest" },
    booking_addons: [{ id: "ba-9", addon_id: "ad-1", name: "Pet Hair Removal", price_cents: 3500, extra_duration_min: 30 }] };
  const other = { id: "o1", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "12:00:00", duration_min: 60 };

  it("lists add-ons and the total price/duration, and reschedules with the full 90 minutes", async () => {
    render(<RequestsTab pending={[req]} busyId={null} onAct={() => {}} allBookings={[req, other]} onRefresh={() => {}} />);
    expect(screen.getByText(/Pet Hair Removal \$35 \(\+30 min\)/)).toBeTruthy();
    expect(screen.getByText(/1 hr 30 min · \$85 total/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
    const form = screen.getByTestId("reschedule-form");
    const has = (t) => !!within(form).queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });
    expect(has("10:30 AM")).toBe(true); // 10:30-12:00
    expect(has("11:00 AM")).toBe(false); // 11:00-12:30 hits 12:00
    fireEvent.click(within(form).getByRole("button", { name: /10:30 AM/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Move to 10:30 AM" }));
    await waitFor(() => expect(mocks.rescheduleBooking).toHaveBeenCalledWith("r1", { bookingDate: "2026-10-09", startTime: "10:30:00" }));
  });
});

describe("Invoice", () => {
  it("shows the service and each add-on as lines that add up to the total", () => {
    render(<InvoiceModal booking={{ ...b2, id: "abcdef1234", profiles: { full_name: "Gina" } }} onClose={() => {}} />);
    expect(screen.getByText("$150.00")).toBeTruthy();
    expect(screen.getByTestId("invoice-addon").textContent).toMatch(/Pet Hair Removal.*\$35\.00/);
    expect(screen.getByText("$185.00")).toBeTruthy();
  });
});

describe("Services tab", () => {
  it("lists every service (inactive too) and every add-on", async () => {
    mocks.fetchAllServices.mockResolvedValue([WASH, { ...DETAIL, active: false }]);
    render(<ServicesTab />);
    expect(await screen.findByText("Full Detail")).toBeTruthy();
    expect(screen.getByText("· inactive")).toBeTruthy();
    expect(await screen.findByText("Pet Hair Removal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("adds a service in cents with a description, and edits name/price/duration", async () => {
    render(<ServicesTab />);
    await screen.findByText("Full Detail");
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ceramic" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Coat\nCure" } });
    fireEvent.change(screen.getByLabelText("Price ($)"), { target: { value: "499.50" } });
    fireEvent.change(screen.getByLabelText("Duration (min)"), { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(mocks.createService).toHaveBeenCalledWith("tenant-1",
      { name: "Ceramic", description: "Coat\nCure", price_cents: 49950, duration_min: 240, sort_order: 3, active: true }));

    fireEvent.click(screen.getByLabelText("Edit Basic Wash"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Basic Wash Plus" } });
    fireEvent.change(screen.getByLabelText("Price ($)"), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledWith("svc-1",
      { name: "Basic Wash Plus", description: null, price_cents: 5500, duration_min: 60 }));
  });

  it("toggles Active and reorders", async () => {
    render(<ServicesTab />);
    await screen.findByText("Full Detail");
    fireEvent.click(screen.getByLabelText("Basic Wash active"));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledWith("svc-1", { active: false }));
    mocks.updateService.mockClear();
    fireEvent.click(screen.getByLabelText("Move Full Detail up"));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledWith("svc-2", { sort_order: 1 }));
    expect(mocks.updateService).toHaveBeenCalledWith("svc-1", { sort_order: 2 });
  });

  it("adds an add-on with its extra minutes", async () => {
    render(<ServicesTab />);
    await screen.findByText("Pet Hair Removal");
    fireEvent.click(screen.getByRole("button", { name: /Add add-on/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Odor Removal" } });
    fireEvent.change(screen.getByLabelText("Price ($)"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("Extra time (min)"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add add-on" }));
    await waitFor(() => expect(mocks.createAddon).toHaveBeenCalledWith("tenant-1",
      { name: "Odor Removal", description: null, price_cents: 6500, extra_duration_min: 30, sort_order: 3, active: true }));
  });

  it("validates input like the database does", () => {
    const f = { name: "Wash", description: "", price: "50", minutes: "10" };
    expect(parseCatalogForm("service", f)[1]).toMatch(/15-720/);
    expect(parseCatalogForm("service", { ...f, minutes: "60", price: "-1" })[1]).toMatch(/price/);
    expect(parseCatalogForm("service", { ...f, minutes: "60", name: "W" })[1]).toMatch(/2-100/);
    expect(parseCatalogForm("addon", { ...f, minutes: "0" })[0]).toMatchObject({ extra_duration_min: 0, price_cents: 5000 });
  });
});
