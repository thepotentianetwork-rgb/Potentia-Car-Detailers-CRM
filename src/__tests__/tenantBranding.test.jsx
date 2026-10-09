import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Per-tenant branding (src/tenants/branding.js). No Supabase: services and
// availability are canned, the tenant comes from a mocked TenantContext.
const mocks = vi.hoisted(() => ({
  slug: "shine",
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
    tenant: { id: "tenant-1", slug: mocks.slug, name: "Some Shop" },
    config: {
      businessName: "Some Shop",
      tagline: "",
      businessHours: { start: "8:00 AM", end: "7:00 PM" },
      bookingGranularityMin: 60,
      mobileTravelBufferMin: 30,
      timezone: "America/Denver",
    },
  }),
}));

import { getTenantBranding, DEFAULT_BRANDING, priceLabel, durationLabel } from "../tenants/branding.js";
import { BookingFlow } from "../pages/BookingFlow.jsx";
import { Homepage } from "../pages/Homepage.jsx";

const JUANS = "juans-auto-detailing";
const SAT_NOON = new Date("2026-10-10T18:00:00Z"); // Sat Oct 10, 12:00 PM in Denver

const juansServices = [
  { id: "s1", name: "Regular — Interior & Exterior", price_cents: 16500, duration_min: 300 },
  { id: "s2", name: "Paint Polish", price_cents: 40000, duration_min: 300 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SAT_NOON);
  mocks.slug = "shine";
  mocks.fetchServices.mockResolvedValue([{ id: "svc-1", name: "Basic Wash", price_cents: 5000, duration_min: 60 }]);
  mocks.fetchAvailability.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("getTenantBranding()", () => {
  it("gives tenants without an entry the default Potentia look", () => {
    expect(getTenantBranding("apex-detailing")).toBe(DEFAULT_BRANDING);
    expect(getTenantBranding(undefined)).toBe(DEFAULT_BRANDING);
    expect(DEFAULT_BRANDING.logo.src).toBe("/potentia-logo.png");
    expect(DEFAULT_BRANDING.closedWeekdays).toEqual([]);
  });

  it("merges Juan's Auto Detailing over the defaults and returns the same object each time", () => {
    const b = getTenantBranding(JUANS);
    expect(b).toBe(getTenantBranding(JUANS));
    expect(b.logo.src).toBe("/tenants/juans-auto-detailing/logo.png");
    expect(b.colors.bg).toBe("#080808");
    expect(b.colors.primary).toBe("#b8bec4");
    expect(b.contact.phone).toBe("435-282-1061");
    expect(b.contact.email).toBe("js07272001@gmail.com");
    expect(b.closedWeekdays).toEqual([0]);
  });

  it("labels starting prices and site duration ranges", () => {
    const b = getTenantBranding(JUANS);
    expect(priceLabel(juansServices[0], b)).toBe("$165");
    expect(priceLabel(juansServices[1], b)).toBe("From $400");
    expect(durationLabel(juansServices[0], b)).toBe("4 – 5 hrs");
    expect(durationLabel({ name: "Basic Wash", duration_min: 90 }, DEFAULT_BRANDING)).toBe("1.5 hr");
  });
});

describe("booking days", () => {
  const dateLabel = () => screen.getByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), Oct \d+$/);
  const nextDay = () => fireEvent.click(dateLabel().parentElement.querySelectorAll("button")[1]);

  it("skips Sundays for Juan's Auto Detailing (closed Sundays)", async () => {
    mocks.slug = JUANS;
    mocks.fetchServices.mockResolvedValue(juansServices);
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /1:00 PM/ });
    expect(dateLabel().textContent).toBe("Sat, Oct 10");
    nextDay();
    expect(dateLabel().textContent).toBe("Mon, Oct 12");
    expect(screen.getByRole("option", { name: "Paint Polish — From $400" })).toBeTruthy();
    expect(screen.getByText("Drop-off at 900 W Main St #20, Tremonton, UT 84337")).toBeTruthy();
  });

  it("still offers Sundays for tenants without closed days", async () => {
    render(<BookingFlow guest onConfirm={vi.fn()} />);
    await screen.findByRole("button", { name: /1:00 PM/ });
    nextDay();
    expect(dateLabel().textContent).toBe("Sun, Oct 11");
  });
});

describe("portal homepage", () => {
  it("shows Juan's logo, package details and contact info", async () => {
    mocks.slug = JUANS;
    mocks.fetchServices.mockResolvedValue(juansServices);
    render(<Homepage onBook={vi.fn()} />);
    await screen.findByText("Regular — Interior & Exterior");
    expect(screen.getByAltText("Juan's Auto Detailing").getAttribute("src")).toBe("/tenants/juans-auto-detailing/logo.png");
    expect(screen.getByText("From $400")).toBeTruthy();
    expect(screen.getByText("· Tire dressing")).toBeTruthy();
    expect(screen.getByText("Call or text 435-282-1061")).toBeTruthy();
    expect(screen.getByText("Open Monday – Saturday")).toBeTruthy();
  });

  it("keeps the default look for other tenants", async () => {
    render(<Homepage onBook={vi.fn()} />);
    await screen.findByText("Basic Wash");
    expect(screen.getByAltText("Potentia").getAttribute("src")).toBe("/potentia-logo.png");
    expect(screen.getByText("$50")).toBeTruthy();
    expect(screen.queryByText(/Contact & Hours/)).toBeNull();
  });
});
