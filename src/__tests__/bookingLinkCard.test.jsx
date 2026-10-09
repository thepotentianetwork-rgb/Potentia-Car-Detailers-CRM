import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ tenant: { id: "t1", slug: "juans-auto-detailing", industry: "auto_detailing" }, name: "Juan's Auto Detailing" }));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({ tenant: mocks.tenant, config: { businessName: mocks.name } }),
}));
vi.mock("../api/bookings.js", () => ({ fetchAllBookings: vi.fn(() => Promise.resolve([])), updateBookingStatus: vi.fn() }));
vi.mock("../pages/admin/RequestsTab.jsx", () => ({ RequestsTab: () => <div>Requests tab</div> }));
vi.mock("../pages/admin/InventoryTab.jsx", () => ({ InventoryTab: () => <div>Inventory</div> }));

import { BookingLinkCard, bookingUrl } from "../components/BookingLinkCard.jsx";
import { AdminDashboard } from "../pages/admin/AdminDashboard.jsx";
import { DealershipDashboard } from "../pages/admin/DealershipDashboard.jsx";

const JUAN = "https://portal.potentianetwork.com/crm/juans-auto-detailing/portal";
const nav = globalThis.navigator;

function setNavigator(extra) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { ...nav, userAgent: nav.userAgent, ...extra } });
}

beforeEach(() => setNavigator({ clipboard: { writeText: vi.fn(() => Promise.resolve()) }, share: undefined }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: nav });
});

describe("Your booking link card", () => {
  it("shows the business's public booking URL with an Open link", () => {
    render(<BookingLinkCard slug="juans-auto-detailing" businessName="Juan's Auto Detailing" />);
    expect(screen.getByText("Your booking link")).toBeTruthy();
    expect(screen.getByLabelText("Booking link").textContent).toBe(JUAN);
    const open = screen.getByText("Open").closest("a");
    expect(open.getAttribute("href")).toBe(JUAN);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
  });

  it("uses each business's own slug", () => {
    expect(bookingUrl("apex-detailing")).toBe("https://portal.potentianetwork.com/crm/apex-detailing/portal");
    expect(bookingUrl("route-six-auto")).toBe("https://portal.potentianetwork.com/crm/route-six-auto/portal");
  });

  it("Copy writes the URL to the clipboard and shows Copied! briefly", async () => {
    vi.useFakeTimers();
    render(<BookingLinkCard slug="juans-auto-detailing" businessName="Juan's Auto Detailing" />);
    await act(async () => fireEvent.click(screen.getByText("Copy")));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JUAN);
    expect(screen.getByText("Copied!")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2100));
    expect(screen.queryByText("Copied!")).toBeNull();
    expect(screen.getByText("Copy")).toBeTruthy();
  });

  it("falls back to selecting the text when the clipboard API is unavailable", async () => {
    setNavigator({ clipboard: undefined, share: undefined });
    document.execCommand = vi.fn(() => false);
    render(<BookingLinkCard slug="juans-auto-detailing" businessName="Juan's Auto Detailing" />);
    await act(async () => fireEvent.click(screen.getByText("Copy")));
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText(/Couldn't copy automatically/)).toBeTruthy();
    expect(screen.queryByText("Copied!")).toBeNull();
    document.execCommand = vi.fn(() => true);
    await act(async () => fireEvent.click(screen.getByText("Copy")));
    expect(screen.getByText("Copied!")).toBeTruthy();
    delete document.execCommand;
  });

  it("hides Share when navigator.share isn't available", () => {
    render(<BookingLinkCard slug="juans-auto-detailing" businessName="Juan's Auto Detailing" />);
    expect(screen.queryByText("Share")).toBeNull();
  });

  it("Share uses the native share sheet when available and ignores cancel", async () => {
    const share = vi.fn(() => Promise.reject(Object.assign(new Error("cancel"), { name: "AbortError" })));
    setNavigator({ clipboard: undefined, share });
    render(<BookingLinkCard slug="juans-auto-detailing" businessName="Juan's Auto Detailing" />);
    await act(async () => fireEvent.click(screen.getByText("Share")));
    expect(share).toHaveBeenCalledWith({ title: "Juan's Auto Detailing", text: "Book with Juan's Auto Detailing", url: JUAN });
    expect(screen.getByText("Your booking link")).toBeTruthy();
  });
});

describe("owner dashboards show the card at the top", () => {
  it("detailing dashboard (Juan)", async () => {
    mocks.tenant = { id: "t1", slug: "juans-auto-detailing", industry: "auto_detailing" };
    render(<AdminDashboard session={{ user: { id: "u1" } }} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText("Booking link").textContent).toBe(JUAN);
    await screen.findByText("Requests tab");
  });

  it("dealership dashboard (Route Six)", () => {
    mocks.tenant = { id: "t3", slug: "route-six-auto", industry: "dealership" };
    mocks.name = "Route Six Auto";
    render(<DealershipDashboard session={{ user: { id: "u1" } }} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText("Booking link").textContent).toBe("https://portal.potentianetwork.com/crm/route-six-auto/portal");
  });
});
