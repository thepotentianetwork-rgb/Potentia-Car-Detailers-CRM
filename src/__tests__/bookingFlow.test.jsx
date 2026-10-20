import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// --- Mocks: no Supabase; services and availability are canned. ---------------
const mocks = vi.hoisted(() => ({
  fetchServices: vi.fn(),
  fetchAvailability: vi.fn(),
  requestBooking: vi.fn(),
  createBooking: vi.fn(),
  createVehicle: vi.fn(),
}));
vi.mock("../api/services.js", () => ({ fetchServices: mocks.fetchServices }));
vi.mock("../api/bookings.js", () => ({
  fetchAvailability: mocks.fetchAvailability,
  requestBooking: mocks.requestBooking,
  createBooking: mocks.createBooking,
}));
vi.mock("../api/vehicles.js", () => ({ createVehicle: mocks.createVehicle }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: "shine", name: "Shine Shop" },
    config: {
      businessName: "Shine Shop",
      businessHours: { start: "9:00 AM", end: "5:00 PM" },
      bookingGranularityMin: 30,
      mobileTravelBufferMin: 30,
      timezone: "America/Denver",
    },
  }),
}));

import { BookingFlow } from "../pages/BookingFlow.jsx";
import { Confirmed } from "../pages/Confirmed.jsx";

const AFTERNOON = new Date("2026-10-08T19:05:00Z"); // Thu Oct 8, 1:05 PM in Denver
const EVENING = new Date("2026-10-09T01:30:00Z"); //   Thu Oct 8, 7:30 PM in Denver (already Oct 9 in UTC)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AFTERNOON);
  mocks.fetchServices.mockResolvedValue([{ id: "svc-1", name: "Basic Wash", price_cents: 5000, duration_min: 60 }]);
  mocks.fetchAvailability.mockResolvedValue([]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-1", status: "pending" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function renderGuest(onConfirm = vi.fn()) {
  render(<BookingFlow guest onConfirm={onConfirm} />);
  await screen.findByRole("button", { name: /2:00 PM/ });
  return onConfirm;
}

function fillGuest({ name = "Gina Guest", phone = "(555) 201-0001", email = "gina@example.com", zip = "", vehicle = "2020 Honda Civic", color = "Blue" } = {}) {
  type("Name", name);
  type("Mobile phone", phone);
  type(/^Email/, email);
  type(/^ZIP/, zip);
  type("Vehicle", vehicle);
  type(/^Color/, color);
}

describe("guest booking form", () => {
  it("asks for name, mobile phone, optional email/ZIP and optional vehicle color", async () => {
    await renderGuest();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Mobile phone")).toBeTruthy();
    expect(screen.getByLabelText("Email (optional)")).toBeTruthy();
    expect(screen.getByLabelText("ZIP (optional)")).toBeTruthy();
    expect(screen.getByLabelText("Color (optional)")).toBeTruthy();
    expect(screen.getByText(/No account needed/)).toBeTruthy();
  });

  it("sends the request through requestBooking with cleaned-up contact info", async () => {
    const onConfirm = await renderGuest();
    fillGuest({ zip: "80202" });
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking).toHaveBeenCalledTimes(1);
    expect(mocks.requestBooking.mock.calls[0][0]).toEqual({
      tenantSlug: "shine",
      serviceIds: ["svc-1"],
      bookingDate: "2026-10-08",
      startTime: "14:00:00",
      type: "dropoff",
      vehicleLabel: "2020 Honda Civic",
      vehicleColor: "Blue",
      mobileAddress: "",
      guestName: "Gina Guest",
      guestPhone: "5552010001",
      guestEmail: "gina@example.com",
      guestZip: "80202",
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(mocks.createVehicle).not.toHaveBeenCalled();
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ guest: true, name: "Gina Guest", phone: "(555) 201-0001", time: "2:00 PM", service: "Basic Wash" });
  });

  it("mobile service needs street, city and ZIP before it can be sent, and sends them as one address", async () => {
    const onConfirm = await renderGuest();
    fillGuest();
    fireEvent.click(screen.getByRole("button", { name: /Mobile/ }));
    const tryBook = () => fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    tryBook();
    expect(await screen.findByText(/street address for mobile service/)).toBeTruthy();
    type("Street address", "1 Main St");
    tryBook();
    expect(await screen.findByText(/city for mobile service/)).toBeTruthy();
    type("City", "Denver");
    tryBook();
    expect(await screen.findByText(/5-digit ZIP for mobile service/)).toBeTruthy();
    type("Service ZIP", "8020");
    tryBook();
    expect(await screen.findByText(/5-digit ZIP for mobile service/)).toBeTruthy();
    expect(mocks.requestBooking).not.toHaveBeenCalled();

    type("Service ZIP", "80202");
    tryBook();
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    // guest ZIP left blank -> taken from the service address
    expect(mocks.requestBooking.mock.calls[0][0]).toMatchObject({ type: "mobile", mobileAddress: "1 Main St, Denver 80202", guestZip: "80202" });
  });

  it("drop-off needs no address and sends none", async () => {
    const onConfirm = await renderGuest();
    fillGuest();
    expect(screen.queryByLabelText("Street address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0]).toMatchObject({ type: "dropoff", mobileAddress: "" });
  });

  it.each([
    ["missing name", { name: "" }, /Enter your name/],
    ["short phone", { phone: "555-12" }, /10-digit/],
    ["bad email", { email: "not-an-email" }, /valid email/],
    ["bad ZIP", { zip: "8020" }, /5-digit ZIP/],
    ["missing vehicle", { vehicle: "" }, /Enter your vehicle/],
  ])("blocks the request on %s", async (_label, override, message) => {
    await renderGuest();
    fillGuest(override);
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mocks.requestBooking).not.toHaveBeenCalled();
  });

  it("a filled-in honeypot field looks like success but sends nothing", async () => {
    const onConfirm = await renderGuest();
    fillGuest();
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "http://spam.example" } });
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking).not.toHaveBeenCalled();
  });

  it("keeps the honeypot out of sight and out of the tab order", async () => {
    await renderGuest();
    const hp = screen.getByLabelText("Website");
    expect(hp.tabIndex).toBe(-1);
    expect(hp.getAttribute("autocomplete")).toBe("off");
    expect(hp.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("shows the server's error and reloads the times (e.g. slot just taken)", async () => {
    mocks.requestBooking.mockRejectedValueOnce(new Error("Sorry, that time was just taken. Pick another."));
    const onConfirm = await renderGuest();
    const before = mocks.fetchAvailability.mock.calls.length;
    fillGuest();
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    expect(await screen.findByText(/just taken/)).toBeTruthy();
    await waitFor(() => expect(mocks.fetchAvailability.mock.calls.length).toBeGreaterThan(before));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("signed-in customer booking", () => {
  it("has no guest fields and books through requestBooking (no direct inserts)", async () => {
    const onConfirm = vi.fn();
    render(<BookingFlow profile={{ id: "user-1" }} onConfirm={onConfirm} />);
    await screen.findByRole("button", { name: /2:00 PM/ });
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Mobile phone")).toBeNull();

    type("Vehicle", "2022 Subaru Outback");
    type(/^Color/, "Green");
    fireEvent.click(screen.getByRole("button", { name: /2:00 PM/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0]).toEqual({
      tenantSlug: "shine", serviceIds: ["svc-1"], bookingDate: "2026-10-08", startTime: "14:00:00", type: "dropoff",
      vehicleLabel: "2022 Subaru Outback", vehicleColor: "Green", mobileAddress: "",
    });
    expect(mocks.createVehicle).not.toHaveBeenCalled();
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(onConfirm.mock.calls[0][0].guest).toBe(false);
  });
});

describe("dates and times use the shop's timezone", () => {
  it("in the evening, 'today' is still today in Denver (not tomorrow from UTC)", async () => {
    vi.setSystemTime(EVENING);
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await waitFor(() => expect(mocks.fetchAvailability).toHaveBeenCalled());
    expect(mocks.fetchAvailability.mock.calls[0][0]).toBe("2026-10-08");
    expect(screen.getByText("Thu, Oct 8")).toBeTruthy();
  });

  it("hides start times that already passed today, plus the 30-minute lead time", async () => {
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /2:00 PM/ });
    const slot = (t) => screen.queryByRole("button", { name: new RegExp(`^\\s*${t}$`) });
    for (const t of ["9:00 AM", "12:30 PM", "1:00 PM", "1:30 PM"]) expect(slot(t)).toBeNull();
    for (const t of ["2:00 PM", "2:30 PM", "4:00 PM"]) expect(slot(t)).toBeTruthy();
  });

  it("shows the whole day for tomorrow", async () => {
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /2:00 PM/ });
    const dateBox = screen.getByText("Thu, Oct 8");
    fireEvent.click(dateBox.nextElementSibling);
    await screen.findByText("Fri, Oct 9");
    expect(await screen.findByRole("button", { name: /9:00 AM/ })).toBeTruthy();
    expect(mocks.fetchAvailability).toHaveBeenLastCalledWith("2026-10-09", "tenant-1");
  });
});

describe("confirmation screen", () => {
  const booking = { service: "Basic Wash", type: "dropoff", dateLabel: "Thu, Oct 8", time: "2:00 PM" };

  it("tells a guest the shop will reach out to confirm, without mentioning an account, texts or emails", () => {
    render(<Confirmed booking={{ ...booking, guest: true, name: "Gina Guest", phone: "(555) 201-0001" }} onDone={() => {}} />);
    expect(screen.getByText("Thanks, Gina!")).toBeTruthy();
    const p = screen.getByText(/We got your request/);
    expect(p.textContent).toContain("Basic Wash (drop-off) on Thu, Oct 8 at 2:00 PM.");
    expect(p.textContent).toContain("Shine Shop will reach out at (555) 201-0001 to confirm.");
    expect(p.textContent).not.toMatch(/account|text|e-?mail|sms/i);
  });

  it("signed-in customers still see the account wording", () => {
    render(<Confirmed booking={booking} onDone={() => {}} />);
    expect(screen.getByText("Request sent")).toBeTruthy();
    expect(screen.getByText(/Saved to your account/)).toBeTruthy();
  });
});

describe("booking window", () => {
  it("offers dates up to 180 days ahead (not just the next six days) and books one months out", async () => {
    const onConfirm = await renderGuest();
    const jump = screen.getByLabelText("Jump to date");
    expect(jump.getAttribute("min")).toBe("2026-10-08");
    expect(jump.getAttribute("max")).toBe("2027-04-06"); // today + 180
    fillGuest();
    fireEvent.change(jump, { target: { value: "2027-02-05" } });
    expect(await screen.findByText("Fri, Feb 5")).toBeTruthy();
    await waitFor(() => expect(mocks.fetchAvailability).toHaveBeenCalledWith("2027-02-05", "tenant-1"));
    fireEvent.click(await screen.findByRole("button", { name: /10:00 AM/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0].bookingDate).toBe("2027-02-05");
  });

  it("the next-day arrow keeps going past two weeks", async () => {
    await renderGuest();
    const next = screen.getByText("Thu, Oct 8").nextElementSibling;
    for (let i = 0; i < 20; i++) fireEvent.click(next);
    expect(screen.getByText("Wed, Oct 28")).toBeTruthy();
  });
});

describe("desktop layout", () => {
  it("is a wider page with two columns at lg: contact/vehicle/drop-off left, services/date/times right", async () => {
    await renderGuest();
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/lg:max-w-3xl/);
    expect(main.querySelector(".lg\\:grid-cols-2")).toBeTruthy();
    const left = screen.getByTestId("booking-col-details");
    const right = screen.getByTestId("booking-col-time");
    expect(left.contains(screen.getByLabelText("Name"))).toBe(true);
    expect(left.contains(screen.getByLabelText("Vehicle"))).toBe(true);
    expect(left.textContent).toMatch(/Drop-off or Mobile/);
    expect(right.contains(screen.getByTestId("booking-total"))).toBe(true);
    expect(right.contains(screen.getByRole("button", { name: /2:00 PM/ }))).toBe(true);
  });
});
