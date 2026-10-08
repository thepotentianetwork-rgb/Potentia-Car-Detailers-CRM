import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Owner email alert (Formspree) after a portal booking request.
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
    tenant: { id: "tenant-1", slug: mocks.slug, name: "Juan's Auto Detailing" },
    config: {
      businessName: "Juan's Auto Detailing",
      businessHours: { start: "8:00 AM", end: "7:00 PM" },
      bookingGranularityMin: 60,
      mobileTravelBufferMin: 30,
      timezone: "America/Denver",
    },
  }),
}));

import { BookingFlow } from "../pages/BookingFlow.jsx";
import { buildBookingAlert, sendBookingAlert } from "../lib/bookingAlert.js";

const FORM = "https://formspree.io/f/mykaqben";
const THU_AFTERNOON = new Date("2026-10-08T19:05:00Z"); // Thu Oct 8, 1:05 PM in Denver
let fetchMock;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(THU_AFTERNOON);
  mocks.slug = "juans-auto-detailing";
  mocks.fetchServices.mockResolvedValue([
    { id: "s1", name: "Exterior Only", price_cents: 7500, duration_min: 90 },
  ]);
  mocks.fetchAvailability.mockResolvedValue([]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-123", status: "pending" });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

async function bookAsGuest({ email = "gina@example.com", mobile = false } = {}) {
  const onConfirm = vi.fn();
  render(<BookingFlow guest onConfirm={onConfirm} />);
  await screen.findByRole("button", { name: /3:00 PM/ });
  type("Name", "Gina Guest");
  type("Mobile phone", "435-555-0101");
  type(/^Email/, email);
  type("Vehicle", "2019 Jeep Wrangler");
  type(/^Color/, "Black");
  if (mobile) {
    fireEvent.click(screen.getByRole("button", { name: /Mobile/ }));
    type(/^ZIP/, "84337");
    type("Address for mobile service", "123 Main St, Tremonton");
  }
  fireEvent.click(screen.getByRole("button", { name: /3:00 PM/ }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  return onConfirm;
}

describe("owner alert after a guest booking request", () => {
  it("posts the booking details to the business's Formspree form", async () => {
    await bookAsGuest({ mobile: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FORM);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Accept: "application/json" });
    expect(sentBody()).toEqual({
      _subject: "New booking request - Juan's Auto Detailing",
      _replyto: "gina@example.com",
      business: "Juan's Auto Detailing",
      status: "Pending: approve or decline it in the CRM",
      customer_name: "Gina Guest",
      customer_type: "Guest (no account)",
      phone: "(435) 555-0101",
      email: "gina@example.com",
      zip: "84337",
      vehicle: "2019 Jeep Wrangler (Black)",
      vehicle_color: "Black",
      service: "Exterior Only",
      price: "From $75",
      service_mode: "Mobile",
      address: "123 Main St, Tremonton",
      date: "Thursday, October 8, 2026",
      start_time: "3:00 PM",
      owner_requests_link: `${window.location.origin}/crm/juans-auto-detailing (Requests tab)`,
      booking_id: "b-123",
    });
  });

  it("leaves out _replyto when the guest gives no email, and marks drop-off", async () => {
    await bookAsGuest({ email: "" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body._replyto).toBeUndefined();
    expect(body.email).toBe("Not provided");
    expect(body.service_mode).toBe("Drop-off");
    expect(body.address).toBe("N/A (drop-off)");
  });

  it("still confirms the booking when the alert request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const onConfirm = await bookAsGuest();
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ guest: true, service: "Exterior Only", time: "3:00 PM" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("still confirms the booking when fetch throws synchronously", async () => {
    fetchMock.mockImplementation(() => { throw new Error("boom"); });
    const onConfirm = await bookAsGuest();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("sends no alert when the booking itself fails", async () => {
    mocks.requestBooking.mockRejectedValue(new Error("Sorry, that time was just taken. Pick another."));
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /3:00 PM/ });
    type("Name", "Gina Guest");
    type("Mobile phone", "4355550101");
    type("Vehicle", "2019 Jeep Wrangler");
    fireEvent.click(screen.getByRole("button", { name: /3:00 PM/ }));
    await screen.findByText(/just taken/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for businesses without an alert URL (e.g. Apex)", async () => {
    mocks.slug = "apex-detailing";
    await bookAsGuest();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("owner alert after a signed-in customer's request", () => {
  it("uses the customer's profile details", async () => {
    const onConfirm = vi.fn();
    render(<BookingFlow customer={{ name: "Carl Customer", phone: "4355550199", email: "carl@example.com" }} onConfirm={onConfirm} />);
    await screen.findByRole("button", { name: /3:00 PM/ });
    type("Vehicle", "2015 Ford F-150");
    fireEvent.click(screen.getByRole("button", { name: /3:00 PM/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalled();
    expect(sentBody()).toMatchObject({
      customer_name: "Carl Customer",
      customer_type: "Customer account",
      phone: "(435) 555-0199",
      email: "carl@example.com",
      _replyto: "carl@example.com",
      vehicle: "2015 Ford F-150",
      vehicle_color: "Not provided",
    });
  });
});

describe("sendBookingAlert()", () => {
  const payload = buildBookingAlert({
    businessName: "Shop", guest: true, customerName: "A", vehicle: "Car", service: "Wash",
    price: "$10", type: "dropoff", dateKey: "2026-10-09", time: "9:00 AM", notes: "Dog hair",
  });

  it("includes notes when there are some", () => {
    expect(payload.notes).toBe("Dog hair");
    expect(payload.date).toBe("Friday, October 9, 2026");
  });

  it("skips without a URL or with a non-Formspree URL", async () => {
    const f = vi.fn();
    expect(await sendBookingAlert(null, payload, f)).toBe(false);
    expect(await sendBookingAlert("", payload, f)).toBe(false);
    expect(await sendBookingAlert("https://evil.example.com/f/x", payload, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("resolves false (never rejects) on errors and non-2xx answers", async () => {
    expect(await sendBookingAlert(FORM, payload, vi.fn().mockRejectedValue(new Error("offline")))).toBe(false);
    expect(await sendBookingAlert(FORM, payload, vi.fn().mockResolvedValue({ ok: false, status: 422 }))).toBe(false);
    expect(await sendBookingAlert(FORM, payload, () => { throw new Error("sync"); })).toBe(false);
    expect(await sendBookingAlert(FORM, payload, vi.fn().mockResolvedValue({ ok: true }))).toBe(true);
  });
});
