import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// The owner dashboard on /crm/<slug> loads only that business's data, even
// for the Potentia admin (whose RLS access spans every business).
const mocks = vi.hoisted(() => ({
  tenant: { id: "t-juan", slug: "juans-auto-detailing", industry: "auto_detailing" },
  fetchTenantBookings: vi.fn(),
  fetchTenantVehicles: vi.fn(),
  fetchTenantExpenses: vi.fn(),
}));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({ tenant: mocks.tenant, config: { businessName: "Biz", expenseCategories: ["Gas"], timezone: "America/Denver" } }),
}));
vi.mock("../api/bookings.js", () => ({ fetchTenantBookings: mocks.fetchTenantBookings, updateBookingStatus: vi.fn() }));
vi.mock("../api/vehicles.js", () => ({ fetchTenantVehicles: mocks.fetchTenantVehicles, updateVehicleNotes: vi.fn() }));
vi.mock("../api/expenses.js", () => ({
  fetchTenantExpenses: mocks.fetchTenantExpenses,
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  uploadReceipt: vi.fn(),
  getReceiptUrl: vi.fn(),
}));

import { AdminDashboard } from "../pages/admin/AdminDashboard.jsx";
import { DealershipDashboard } from "../pages/admin/DealershipDashboard.jsx";

const juanBooking = {
  id: "b1", tenant_id: "t-juan", profile_id: "p-fer", status: "approved", booking_date: "2026-10-09", start_time: "09:00",
  duration_min: 60, price_cents: 24000, paid: true, type: "dropoff", profiles: { full_name: "Fernando Mejia", source: "guest" }, services: { name: "Regular" },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("owner dashboard is scoped to the business in the URL", () => {
  it("loads bookings, customer vehicles and expenses for that business only", async () => {
    mocks.tenant = { id: "t-juan", slug: "juans-auto-detailing", industry: "auto_detailing" };
    mocks.fetchTenantBookings.mockResolvedValue([juanBooking]);
    mocks.fetchTenantVehicles.mockResolvedValue([]);
    mocks.fetchTenantExpenses.mockResolvedValue([]);
    render(<AdminDashboard session={{ user: { id: "admin" } }} onSignOut={vi.fn()} />);
    await screen.findByText("Customers");
    expect(mocks.fetchTenantBookings).toHaveBeenCalledWith("t-juan");

    fireEvent.click(screen.getByText("Customers"));
    await screen.findByText("Fernando Mejia");
    expect(mocks.fetchTenantVehicles).toHaveBeenCalledWith("t-juan");

    fireEvent.click(screen.getByText("Expenses"));
    await vi.waitFor(() => expect(mocks.fetchTenantExpenses).toHaveBeenCalledWith("t-juan"));
    for (const fn of [mocks.fetchTenantBookings, mocks.fetchTenantVehicles, mocks.fetchTenantExpenses]) {
      for (const args of fn.mock.calls) expect(args).toEqual(["t-juan"]);
    }
  });

  it("dealership expenses are scoped too", async () => {
    mocks.tenant = { id: "t-r6", slug: "route-six-auto", industry: "dealership" };
    mocks.fetchTenantExpenses.mockResolvedValue([]);
    vi.doMock("../pages/admin/InventoryTab.jsx", () => ({ InventoryTab: () => null }));
    render(<DealershipDashboard session={{ user: { id: "admin" } }} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByText("Expenses"));
    await vi.waitFor(() => expect(mocks.fetchTenantExpenses).toHaveBeenCalledWith("t-r6"));
  });
});
