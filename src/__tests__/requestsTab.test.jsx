import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ fetchTenantVehicles: vi.fn(), updateVehicleNotes: vi.fn() }));
vi.mock("../api/vehicles.js", () => ({ fetchTenantVehicles: mocks.fetchTenantVehicles, updateVehicleNotes: mocks.updateVehicleNotes }));

import { RequestsTab } from "../pages/admin/RequestsTab.jsx";
import { CustomersTab } from "../pages/admin/CustomersTab.jsx";

const guestMobile = {
  id: "b-1", profile_id: "p-guest", status: "pending", type: "mobile", booking_date: "2026-10-09", start_time: "14:00:00", duration_min: 60,
  mobile_address: "1 Main St, Denver", services: { name: "Basic Wash" },
  profiles: { full_name: "Gina Guest", phone: "5552010001", email: "gina@example.com", zip: "80202", source: "guest" },
  vehicles: { label: "2020 Honda Civic", color: "Blue" },
};
const accountDropoff = {
  id: "b-2", profile_id: "p-acct", status: "pending", type: "dropoff", booking_date: "2026-10-10", start_time: "09:00:00", duration_min: 60,
  mobile_address: null, services: { name: "Full Detail" },
  profiles: { full_name: "Carl Customer", phone: "5552010002", email: "carl@example.com", zip: "80301", source: "account" },
  vehicles: { label: "2022 Subaru Outback", color: null },
};

let writeText;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete navigator.clipboard;
});

const card = (name) => screen.getByText(name).closest(".rounded-lg");

describe("owner Requests tab", () => {
  it("shows a Guest badge and the guest's phone, email, vehicle + color and mobile address + ZIP", () => {
    render(<RequestsTab pending={[guestMobile]} busyId={null} onAct={() => {}} />);
    const c = within(card("Gina Guest"));
    expect(c.getByText("Guest")).toBeTruthy();
    expect(c.getByText("(555) 201-0001")).toBeTruthy();
    expect(c.getByText("gina@example.com")).toBeTruthy();
    expect(c.getByText(/2020 Honda Civic · Blue/)).toBeTruthy();
    expect(c.getByText("1 Main St, Denver · 80202")).toBeTruthy();
  });

  it("account customers get no Guest badge; drop-offs show the ZIP but no address", () => {
    render(<RequestsTab pending={[accountDropoff]} busyId={null} onAct={() => {}} />);
    const c = within(card("Carl Customer"));
    expect(c.queryByText("Guest")).toBeNull();
    expect(c.getByText("(555) 201-0002")).toBeTruthy();
    expect(c.getByText("ZIP 80301")).toBeTruthy();
    expect(c.getByText(/2022 Subaru Outback/).textContent).not.toContain("·");
  });

  it("shows the phone as plain text with a Copy button, never as a tel: or sms: link (calls go through Google Voice)", () => {
    const { container } = render(<RequestsTab pending={[guestMobile, accountDropoff]} busyId={null} onAct={() => {}} />);
    expect(screen.getByText("(555) 201-0001")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Copy phone number/ })).toHaveLength(2);
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(container.innerHTML).not.toMatch(/tel:|sms:/i);
  });

  it("Copy puts the number on the clipboard and says so", async () => {
    render(<RequestsTab pending={[guestMobile]} busyId={null} onAct={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy phone number (555) 201-0001" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("(555) 201-0001"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("falls back to execCommand('copy') where the clipboard API is unavailable", async () => {
    delete navigator.clipboard;
    document.execCommand = vi.fn().mockReturnValue(true);
    render(<RequestsTab pending={[guestMobile]} busyId={null} onAct={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy phone number/ }));
    await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith("copy"));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("Approve / Decline still work", () => {
    const onAct = vi.fn();
    render(<RequestsTab pending={[guestMobile]} busyId={null} onAct={onAct} />);
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onAct.mock.calls).toEqual([["b-1", "approved"], ["b-1", "declined"]]);
  });
});

describe("owner Customers tab", () => {
  it("marks guest customers with a Guest badge", async () => {
    mocks.fetchTenantVehicles.mockResolvedValue([]);
    render(<CustomersTab bookings={[guestMobile, accountDropoff]} tenantId="t-apex" />);
    await screen.findByText("Gina Guest");
    expect(within(card("Gina Guest")).getByText("Guest")).toBeTruthy();
    expect(within(card("Carl Customer")).queryByText("Guest")).toBeNull();
    expect(mocks.fetchTenantVehicles).toHaveBeenCalledWith("t-apex");
  });
});
