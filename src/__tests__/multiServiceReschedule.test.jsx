import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

// Multi-service booking, services manager and staff reschedule. No Supabase: API is mocked.
const mocks = vi.hoisted(() => ({
  fetchServices: vi.fn(), fetchAllServices: vi.fn(),
  createService: vi.fn(), updateService: vi.fn(),
  fetchAvailability: vi.fn(), requestBooking: vi.fn(), createManualBooking: vi.fn(),
  setBookingServices: vi.fn(), rescheduleBooking: vi.fn(),
  fetchTenantCustomers: vi.fn(), fetchTenantStaff: vi.fn(),
}));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../api/services.js", () => ({
  fetchServices: mocks.fetchServices, fetchAllServices: mocks.fetchAllServices,
  createService: mocks.createService, updateService: mocks.updateService,
}));
vi.mock("../api/bookings.js", () => ({
  fetchAvailability: mocks.fetchAvailability, requestBooking: mocks.requestBooking, createManualBooking: mocks.createManualBooking,
  setBookingServices: mocks.setBookingServices, rescheduleBooking: mocks.rescheduleBooking,
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
import { iso } from "../lib/time.js";
import { ScheduleTab } from "../pages/admin/ScheduleTab.jsx";
import { RequestsTab } from "../pages/admin/RequestsTab.jsx";
import { ServicesTab, parseCatalogForm } from "../pages/admin/ServicesTab.jsx";
import { InvoiceModal } from "../components/InvoiceModal.jsx";
import { buildBookingAlert } from "../lib/bookingAlert.js";
import { serviceIncludes } from "../lib/addons.js";
import { serviceTotals, bookingLineItems, bookingTitle } from "../lib/bookingServices.js";

const WASH = { id: "svc-1", name: "Basic Wash", price_cents: 5000, duration_min: 60, active: true, sort_order: 1 };
const DETAIL = { id: "svc-2", name: "Full Detail", price_cents: 15000, duration_min: 90, active: true, sort_order: 2 };
const PET = { id: "svc-3", name: "Pet Hair Removal", price_cents: 3500, duration_min: 30, active: true, sort_order: 3 };

const box = (name) => screen.getByLabelText(new RegExp(`^${name} · `));
const slot = (t) => screen.queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T19:05:00Z")); // Thu Oct 8, 1:05 PM Denver
  mocks.fetchServices.mockResolvedValue([WASH, DETAIL, PET]);
  mocks.fetchAllServices.mockResolvedValue([WASH, DETAIL, PET]);
  // 3:00-4:00 PM is taken today
  mocks.fetchAvailability.mockResolvedValue([{ start_time: "15:00:00", duration_min: 60, type: "dropoff" }]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-1" });
  mocks.createManualBooking.mockResolvedValue({ booking_id: "b-1" });
  mocks.setBookingServices.mockResolvedValue({});
  mocks.rescheduleBooking.mockResolvedValue({});
  mocks.fetchTenantCustomers.mockResolvedValue([]);
  mocks.fetchTenantStaff.mockResolvedValue([]);
  mocks.updateService.mockResolvedValue({});
  mocks.createService.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("multi-service math and display", () => {
  it("sums any number of services (deduped, in pick order)", () => {
    const t = serviceTotals([WASH, DETAIL, PET], ["svc-3", "svc-1", "svc-3", "nope"]);
    expect(t).toMatchObject({ priceCents: 8500, durationMin: 90 });
    expect(t.selected.map((s) => s.name)).toEqual(["Pet Hair Removal", "Basic Wash"]);
  });
  it("shows new bookings from their booking_services snapshot, in order", () => {
    expect(bookingTitle(b3)).toBe("Basic Wash + Pet Hair Removal");
    expect(bookingLineItems(b3).map((i) => [i.name, i.price_cents, i.duration_min])).toEqual([["Basic Wash", 4000, 60], ["Pet Hair Removal", 3500, 30]]);
  });
  it("still shows add-on-era bookings as the service plus each add-on, adding up to the stored total", () => {
    expect(bookingTitle(b2)).toBe("Full Detail + Pet Hair Removal");
    const items = bookingLineItems(b2);
    expect(items.map((i) => [i.name, i.price_cents, i.duration_min, !!i.addon])).toEqual([["Full Detail", 15000, 90, false], ["Pet Hair Removal", 3500, 30, true]]);
    expect(bookingTitle(b1)).toBe("Basic Wash");
  });
  it("homepage copy uses services.description and falls back to the tenant file", () => {
    const branding = { serviceDetails: { "Basic Wash": { includes: ["Old copy"] } } };
    expect(serviceIncludes({ ...WASH, description: "Hand wash\n\nTire shine" }, branding)).toEqual(["Hand wash", "Tire shine"]);
    expect(serviceIncludes({ ...WASH, description: "" }, branding)).toEqual(["Old copy"]);
    expect(serviceIncludes({ ...WASH, name: "Renamed", description: "" }, branding)).toEqual([]);
  });
  it("the owner alert lists each service and the totals when there are several", () => {
    const p = buildBookingAlert({ businessName: "S", service: "Basic Wash + Pet Hair Removal", price: "$85", dateKey: "2026-10-08", time: "2:00 PM",
      services: [WASH, PET], totalPrice: "$85", totalDuration: "1 hr 30 min" });
    expect(p.services).toBe("Basic Wash $50 (60 min); Pet Hair Removal $35 (30 min)");
    expect(p.total_price).toBe("$85");
    expect(p.total_duration).toBe("1 hr 30 min");
    expect(p).not.toHaveProperty("add_ons");
  });
});

describe("customer booking: any number of services", () => {
  it("has a checkbox per service (first ticked), a running total, slots for the FULL combined length, and no add-ons section", async () => {
    render(<BookingFlow guest onConfirm={() => {}} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy()); // Basic Wash 2:00-3:00 fits before the 3:00 booking
    expect(box("Basic Wash").checked).toBe(true);
    expect(screen.queryByText(/add-on/i)).toBeNull();
    fireEvent.click(box("Pet Hair Removal"));
    expect(screen.getByTestId("booking-total").textContent).toMatch(/\$85 · 1 hr 30 min/);
    // 2:00 + 90 min would run into 3:00; 4:00 + 90 would pass closing
    expect(slot("2:00 PM")).toBeNull();
    expect(screen.getByText(/No open time on this day fits Basic Wash \+ Pet Hair Removal \(1 hr 30 min\)/)).toBeTruthy();
    // only Pet Hair Removal: 30 min, so 2:30-3:00 fits
    fireEvent.click(box("Basic Wash"));
    expect(screen.getByTestId("booking-total").textContent).toMatch(/\$35 · 30 min/);
    expect(slot("2:30 PM")).toBeTruthy();
    // nothing ticked: no times offered
    fireEvent.click(box("Pet Hair Removal"));
    expect(slot("2:00 PM")).toBeNull();
    expect(screen.getByText(/Pick at least one service to see open times/)).toBeTruthy();
  });

  it("books only Pet Hair Removal", async () => {
    const onConfirm = vi.fn();
    mocks.fetchAvailability.mockResolvedValue([]);
    render(<BookingFlow guest onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByLabelText(/^Basic Wash · /));
    fireEvent.click(box("Pet Hair Removal"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gina Guest" } });
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "5552010001" } });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "2020 Civic" } });
    expect(slot("4:30 PM")).toBeTruthy(); // 4:30-5:00
    fireEvent.click(slot("4:30 PM"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0].serviceIds).toEqual(["svc-3"]);
    expect(mocks.requestBooking.mock.calls[0][0]).not.toHaveProperty("addonIds");
    expect(onConfirm.mock.calls[0][0].service).toBe("Pet Hair Removal");
  });

  it("sends every chosen service in pick order and only offers times the combined job fits", async () => {
    const onConfirm = vi.fn();
    mocks.fetchAvailability.mockResolvedValue([]);
    render(<BookingFlow guest onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByLabelText(/^Full Detail · /));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gina Guest" } });
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "5552010001" } });
    fireEvent.change(screen.getByLabelText("Vehicle"), { target: { value: "2020 Civic" } });
    // 60 + 90 = 150 min: 2:30 PM ends 5:00, 3:00 PM would pass closing
    expect(slot("2:30 PM")).toBeTruthy();
    expect(slot("3:00 PM")).toBeNull();
    fireEvent.click(slot("2:30 PM"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0].serviceIds).toEqual(["svc-1", "svc-2"]);
    expect(onConfirm.mock.calls[0][0].service).toBe("Basic Wash + Full Detail");
  });

  it("won't submit with no service picked", async () => {
    mocks.fetchServices.mockResolvedValue([PET]);
    mocks.fetchAvailability.mockResolvedValue([]);
    render(<BookingFlow guest onConfirm={() => {}} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy());
    fireEvent.click(box("Pet Hair Removal"));
    expect(slot("2:00 PM")).toBeNull();
    expect(mocks.requestBooking).not.toHaveBeenCalled();
  });
});

describe("staff Add Booking: any number of services", () => {
  it("offers only slots that fit every checked service and sends them in one call", async () => {
    const onCreated = vi.fn();
    render(<ManualBookingForm onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy());
    fireEvent.click(box("Pet Hair Removal"));
    expect(screen.getByTestId("manual-total").textContent).toMatch(/\$85 · 1 hr 30 min/);
    expect(slot("2:00 PM")).toBeNull();
    expect(slot("1:30 PM")).toBeTruthy(); // 1:30-3:00
    expect(screen.queryByText(/add-on/i)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("e.g. Jamie Rivera"), { target: { value: "Jamie" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 2021 Ford F-150"), { target: { value: "Tacoma" } });
    fireEvent.click(slot("1:30 PM"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mocks.createManualBooking.mock.calls[0][0]).toMatchObject({ startTime: "13:30:00", serviceIds: ["svc-1", "svc-3"], newName: "Jamie" });
    expect(mocks.createManualBooking.mock.calls[0][0]).not.toHaveProperty("addonIds");
  });
  it("can book a single small service on its own", async () => {
    const onCreated = vi.fn();
    render(<ManualBookingForm onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() => expect(slot("2:00 PM")).toBeTruthy());
    fireEvent.click(box("Basic Wash"));
    fireEvent.click(box("Pet Hair Removal"));
    expect(slot("2:30 PM")).toBeTruthy(); // 2:30-3:00
    fireEvent.change(screen.getByPlaceholderText("e.g. Jamie Rivera"), { target: { value: "Jamie" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 2021 Ford F-150"), { target: { value: "Tacoma" } });
    fireEvent.click(slot("2:30 PM"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mocks.createManualBooking.mock.calls[0][0].serviceIds).toEqual(["svc-3"]);
  });
});

// Tomorrow (Fri Oct 9): b1 Basic Wash 10:00-11:00, b2 Full Detail + Pet Hair add-on 12:00-2:00 (120 min, add-on era).
// Sat Oct 10: b3 Basic Wash + Pet Hair Removal (two services) 9:00-10:30; Wash was booked at $40.
const b1 = { id: "b1", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "10:00:00", duration_min: 60,
  price_cents: 5000, service_id: "svc-1", services: { name: "Basic Wash" }, booking_addons: [] };
const b2 = { id: "b2", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "12:00:00", duration_min: 120,
  price_cents: 18500, service_id: "svc-2", services: { name: "Full Detail" },
  booking_addons: [{ id: "ba-1", addon_id: "ad-1", name: "Pet Hair Removal", price_cents: 3500, extra_duration_min: 30 }] };
const b3 = { id: "b3", status: "approved", type: "dropoff", booking_date: "2026-10-10", start_time: "09:00:00", duration_min: 90,
  price_cents: 7500, service_id: "svc-1", services: { name: "Basic Wash" }, booking_addons: [],
  booking_services: [
    { id: "bs-2", service_id: "svc-3", name: "Pet Hair Removal", price_cents: 3500, duration_min: 30, position: 2 },
    { id: "bs-1", service_id: "svc-1", name: "Basic Wash", price_cents: 4000, duration_min: 60, position: 1 },
  ] };
const b4 = { id: "b4", status: "approved", type: "dropoff", booking_date: "2026-10-10", start_time: "11:00:00", duration_min: 60,
  price_cents: 5000, service_id: "svc-1", services: { name: "Basic Wash" }, booking_addons: [] };

describe("Schedule tab", () => {
  const renderSchedule = () => render(<ScheduleTab bookings={[b1, b2, b3, b4]} busyId={null} onAct={() => {}} onRefresh={() => {}} />);
  const rowOf = (text) => screen.getAllByText(text)[0].closest("div"); // first match = earliest day

  it("timeline bars block each booking's FULL duration; the list shows every service, and add-ons on older bookings", () => {
    renderSchedule();
    const bars = screen.getAllByTestId("timeline-bar");
    const bar2 = bars.find((b) => b.title.startsWith("Full Detail"));
    expect(bar2.style.width).toBe("25%"); // 120 of the 480-minute day
    expect(bar2.style.left).toBe("37.5%");
    const bar3 = bars.find((b) => b.title.startsWith("Basic Wash + Pet Hair Removal"));
    expect(bar3.style.width).toBe("18.75%"); // 90 of 480
    expect(screen.getByText("Full Detail + Pet Hair Removal")).toBeTruthy();
    expect(screen.getByText("Basic Wash + Pet Hair Removal")).toBeTruthy();
  });

  it("editing services recomputes the total and blocks a longer job that would collide", async () => {
    renderSchedule();
    fireEvent.click(within(rowOf("Basic Wash")).getByLabelText("Change services"));
    await screen.findByTestId("edit-total");
    const form = screen.getByTestId("edit-total").parentElement;
    const tick = (name) => fireEvent.click(within(form).getByLabelText(new RegExp(`^${name} · `)));
    expect(within(form).getByLabelText(/^Basic Wash · /).checked).toBe(true);
    tick("Pet Hair Removal"); // 10:00-11:30 still fits
    expect(screen.getByTestId("edit-total").textContent).toMatch(/\$85 · 1 hr 30 min/);
    expect(screen.queryByRole("alert")).toBeNull();
    tick("Full Detail"); // 60 + 30 + 90 = 3 hr: 10:00-1:00 hits 12:00
    expect(screen.getByRole("alert").textContent).toMatch(/would overlap Full Detail \+ Pet Hair Removal at 12:00 PM/);
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
    tick("Full Detail");
    tick("Basic Wash"); // only Pet Hair Removal
    expect(screen.getByTestId("edit-total").textContent).toMatch(/\$35 · 30 min/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.setBookingServices).toHaveBeenCalledWith("b1", { serviceIds: ["svc-3"] }));
  });

  it("can't save with no service ticked", async () => {
    renderSchedule();
    fireEvent.click(within(rowOf("Basic Wash")).getByLabelText("Change services"));
    const form = (await screen.findByTestId("edit-total")).parentElement;
    fireEvent.click(within(form).getByLabelText(/^Basic Wash · /));
    expect(screen.getByTestId("edit-total").textContent).toMatch(/Pick at least one service/);
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  it("editing a multi-service booking starts from its services and keeps their booked prices", async () => {
    renderSchedule();
    fireEvent.click(within(rowOf("Basic Wash + Pet Hair Removal")).getByLabelText("Change services"));
    const form = (await screen.findByTestId("edit-total")).parentElement;
    expect(within(form).getByLabelText(/^Basic Wash · \$40 · /).checked).toBe(true); // booked at $40, list price $50
    expect(within(form).getByLabelText(/^Pet Hair Removal · /).checked).toBe(true);
    expect(screen.getByTestId("edit-total").textContent).toMatch(/\$75 · 1 hr 30 min/);
    // + Full Detail: 9:00-12:00 runs into b4 at 11:00
    fireEvent.click(within(form).getByLabelText(/^Full Detail · /));
    expect(screen.getByRole("alert").textContent).toMatch(/would overlap Basic Wash at 11:00 AM/);
  });

  it("an add-on-era booking keeps its add-ons in the total while services change", async () => {
    renderSchedule();
    fireEvent.click(within(rowOf("Full Detail + Pet Hair Removal")).getByLabelText("Change services"));
    const form = (await screen.findByTestId("edit-total")).parentElement;
    expect(within(form).getByText(/Kept from the original booking: Pet Hair Removal/)).toBeTruthy();
    expect(screen.getByTestId("edit-total").textContent).toMatch(/\$185 · 2 hr/);
  });

  it("shows the server's message if it rejects the change", async () => {
    mocks.setBookingServices.mockRejectedValue(new Error("That would overlap another booking (this job is 120 min). Pick another time."));
    renderSchedule();
    fireEvent.click(within(rowOf("Basic Wash")).getByLabelText("Change services"));
    const form = (await screen.findByTestId("edit-total")).parentElement;
    fireEvent.click(within(form).getByLabelText(/^Pet Hair Removal · /));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/overlap another booking/)).toBeTruthy();
  });

  it("schedule shows bookings weeks ahead after Show more days", async () => {
    const far = { ...b2, id: "b9", booking_date: iso(new Date(Date.now() + 20 * 86400000), "America/Denver"), profiles: { full_name: "Far Away" } };
    render(<ScheduleTab bookings={[b1, far]} busyId={null} onAct={() => {}} onRefresh={() => {}} />);
    const bars = () => screen.queryAllByTestId("timeline-bar").length;
    const before = bars();
    fireEvent.click(screen.getByText(/Show more days \(1 later booking\)/));
    fireEvent.click(screen.getByText(/Show more days/));
    expect(bars()).toBe(before + 1);
    expect(screen.getByText(/^Show more days$/)).toBeTruthy();
  });

  it("reschedule can move a booking months ahead (jump to date, up to 180 days)", async () => {
    render(<ScheduleTab bookings={[b1, b2]} busyId={null} onAct={() => {}} onRefresh={() => {}} />);
    fireEvent.click(within(screen.getByText(/Full Detail/).closest("div")).getByLabelText("Reschedule"));
    const form = screen.getByTestId("reschedule-form");
    const jump = within(form).getByLabelText("Jump to date");
    expect(jump.getAttribute("max")).toBe(iso(new Date(Date.now() + 180 * 86400000), "America/Denver"));
    const target = iso(new Date(Date.now() + 120 * 86400000), "America/Denver");
    fireEvent.change(jump, { target: { value: target } });
    fireEvent.click(within(form).getByRole("button", { name: /11:00 AM/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Move to 11:00 AM" }));
    await waitFor(() => expect(mocks.rescheduleBooking).toHaveBeenCalledWith("b2", { bookingDate: target, startTime: "11:00:00" }));
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

  it("reschedule of a multi-service booking only offers slots for the combined length", async () => {
    render(<ScheduleTab bookings={[b3, b4]} busyId={null} onAct={() => {}} onRefresh={() => {}} />);
    fireEvent.click(within(screen.getByText("Basic Wash + Pet Hair Removal").closest("div")).getByLabelText("Reschedule"));
    const form = screen.getByTestId("reschedule-form");
    const has = (t) => !!within(form).queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });
    expect(has("9:30 AM")).toBe(true); // 9:30-11:00 (its own slot doesn't block it)
    expect(has("10:00 AM")).toBe(false); // 10:00-11:30 hits b4 at 11:00 (a 60-min job would fit)
    expect(has("12:00 PM")).toBe(true);
    expect(has("3:30 PM")).toBe(true); // 3:30-5:00
    expect(has("4:00 PM")).toBe(false);
  });
});

describe("Requests tab", () => {
  const req = { id: "r1", status: "pending", type: "dropoff", booking_date: "2026-10-09", start_time: "09:00:00", duration_min: 90,
    price_cents: 8500, services: { name: "Basic Wash" }, profiles: { full_name: "Gina Guest", source: "guest" },
    booking_addons: [{ id: "ba-9", addon_id: "ad-1", name: "Pet Hair Removal", price_cents: 3500, extra_duration_min: 30 }] };
  const other = { id: "o1", status: "approved", type: "dropoff", booking_date: "2026-10-09", start_time: "12:00:00", duration_min: 60 };

  it("lists an add-on-era request's add-ons and the total, and reschedules with the full 90 minutes", async () => {
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

  it("lists each service of a multi-service request with its price and time", () => {
    const multi = { ...b3, status: "pending", profiles: { full_name: "Mo Multi", source: "guest" } };
    render(<RequestsTab pending={[multi]} busyId={null} onAct={() => {}} allBookings={[multi]} onRefresh={() => {}} />);
    const list = screen.getByRole("list", { name: "Services" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent.trim())).toEqual(["Basic Wash $40 (60 min)", "Pet Hair Removal $35 (30 min)"]);
    expect(screen.getByText(/1 hr 30 min · \$75 total/)).toBeTruthy();
  });
});

describe("Invoice", () => {
  it("an add-on-era booking shows the service and each add-on as lines that add up to the total", () => {
    render(<InvoiceModal booking={{ ...b2, id: "abcdef1234", profiles: { full_name: "Gina" } }} onClose={() => {}} />);
    expect(screen.getByText("$150.00")).toBeTruthy();
    expect(screen.getByTestId("invoice-line").textContent).toMatch(/\+ Pet Hair Removal.*Add-on · 30 min.*\$35\.00/);
    expect(screen.getByText("$185.00")).toBeTruthy();
  });
  it("a multi-service booking shows one line per service at its booked price", () => {
    render(<InvoiceModal booking={{ ...b3, id: "abcdef1234", profiles: { full_name: "Gina" } }} onClose={() => {}} />);
    expect(screen.getByText("Basic Wash")).toBeTruthy();
    expect(screen.getByText("$40.00")).toBeTruthy();
    expect(screen.getByTestId("invoice-line").textContent).toMatch(/Pet Hair Removal.*Service · 30 min.*\$35\.00/);
    expect(screen.getByText("$75.00")).toBeTruthy();
  });
});

describe("Services tab", () => {
  it("lists every service (inactive too) and has no add-on section", async () => {
    mocks.fetchAllServices.mockResolvedValue([WASH, { ...DETAIL, active: false }]);
    render(<ServicesTab />);
    expect(await screen.findByText("Full Detail")).toBeTruthy();
    expect(screen.getByText("· inactive")).toBeTruthy();
    expect(screen.queryByText(/add-on/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Add add-on/ })).toBeNull();
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
      { name: "Ceramic", description: "Coat\nCure", price_cents: 49950, duration_min: 240, sort_order: 4, active: true }));

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

  it("validates input like the database does", () => {
    const f = { name: "Wash", description: "", price: "50", minutes: "10" };
    expect(parseCatalogForm("service", f)[1]).toMatch(/15-720/);
    expect(parseCatalogForm("service", { ...f, minutes: "60", price: "-1" })[1]).toMatch(/price/);
    expect(parseCatalogForm("service", { ...f, minutes: "60", name: "W" })[1]).toMatch(/2-100/);
    expect(parseCatalogForm("service", { ...f, minutes: "480", price: "600" })[0]).toMatchObject({ duration_min: 480, price_cents: 60000 });
  });
});
