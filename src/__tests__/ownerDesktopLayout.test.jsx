import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  tenant: { id: "t-juan", slug: "juans-auto-detailing", industry: "auto_detailing" },
  fetchTenantBookings: vi.fn(),
  fetchTenantVehicles: vi.fn(),
  fetchTenantExpenses: vi.fn(),
}));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({ tenant: mocks.tenant, config: {
    businessName: "Juan's Auto Detailing", expenseCategories: ["Gas"], timezone: "America/Denver",
    businessHours: { start: "8:00 AM", end: "6:00 PM" }, bookingGranularityMin: 30, mobileTravelBufferMin: 30 } }),
}));
vi.mock("../api/bookings.js", () => ({ fetchTenantBookings: mocks.fetchTenantBookings, updateBookingStatus: vi.fn(), rescheduleBooking: vi.fn() }));
vi.mock("../api/vehicles.js", () => ({ fetchTenantVehicles: mocks.fetchTenantVehicles, updateVehicleNotes: vi.fn() }));
vi.mock("../api/services.js", async (orig) => ({ ...(await orig()), fetchAllServices: vi.fn(() => Promise.resolve([])), fetchServices: vi.fn(() => Promise.resolve([])) }));
vi.mock("../api/expenses.js", () => ({
  fetchTenantExpenses: mocks.fetchTenantExpenses, createExpense: vi.fn(), deleteExpense: vi.fn(), uploadReceipt: vi.fn(), getReceiptUrl: vi.fn(),
}));

import { AdminDashboard } from "../pages/admin/AdminDashboard.jsx";
import { DashboardLayout } from "../components/DashboardLayout.jsx";
import { iso } from "../lib/time.js";

function setDesktop(on) {
  window.matchMedia = (q) => ({ matches: on && /min-width: 1024px/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
}

const TODAY = iso(new Date(), "America/Denver");
const bk = (o) => ({ profile_id: "p-ana", status: "approved", booking_date: TODAY, start_time: "10:00:00", duration_min: 120, price_cents: 18000, type: "dropoff",
  profiles: { full_name: "Ana Ruiz", phone: "4355550101", source: "guest" }, services: { name: "Regular" }, vehicles: { label: "2019 Honda CR-V" },
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...o });

afterEach(() => { cleanup(); vi.clearAllMocks(); delete window.matchMedia; });

describe("Juan's silver owner dashboard", () => {
  const juan = { id: "t-juan", slug: "juans-auto-detailing", industry: "auto_detailing" };

  it("only Juan's shop gets the silver theme; other shops keep the standard tabs", async () => {
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([]);
    const { container, unmount } = render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    expect(container.querySelector('[data-theme="silver"]')).toBeTruthy();
    unmount();
    mocks.tenant = { id: "t-other", slug: "shine-shop", industry: "auto_detailing" };
    const r = render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    expect(r.container.querySelector('[data-theme="silver"]')).toBeNull();
    await screen.findByText("Requests");
  });

  it("overview shows real stat cards, today's schedule, pipeline and activity; empty states with no data", async () => {
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([
      bk({ id: "b1" }),
      bk({ id: "b2", status: "pending", start_time: "08:00:00", profiles: { full_name: "Bo Lee", source: "account" } }),
      bk({ id: "b3", status: "completed", price_cents: 24000 }),
    ]);
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} ownerName="Juan Sanchez" />);
    await screen.findByText(/, Juan$/);
    expect(mocks.fetchTenantBookings).toHaveBeenCalledWith("t-juan");
    const cards = screen.getByTestId("stat-cards");
    expect(within(cards).getByText("New leads").parentElement.textContent).toMatch(/New leads3/);
    expect(within(cards).getByText("Appointments").parentElement.textContent).toMatch(/Appointments3/);
    expect(within(cards).getByText("Revenue").parentElement.textContent).toMatch(/\$240/);
    expect(within(cards).getByText("Completed jobs").parentElement.textContent).toMatch(/Completed jobs1/);
    const sched = screen.getByLabelText("Today's schedule");
    expect(within(sched).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringMatching(/8:00.*Bo Lee.*Regular · 2019 Honda CR-V.*New request/),
      expect.stringMatching(/10:00.*Ana Ruiz.*Scheduled/),
      expect.stringMatching(/10:00.*Ana Ruiz.*Completed/),
    ]);
    const pipe = screen.getByLabelText("Lead pipeline");
    expect(pipe.querySelector('[data-stage="pending"]').textContent).toBe("1");
    expect(pipe.querySelector('[data-stage="approved"]').textContent).toBe("1");
    expect(pipe.querySelector('[data-stage="completed"]').textContent).toBe("1");
    expect(screen.getByLabelText("Recent activity").textContent).toMatch(/Job completed/);
  });

  it("no bookings: zeros and empty states, no made-up numbers", async () => {
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([]);
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    await screen.findByText("Nothing booked for today.");
    expect(screen.getByText("No activity yet.")).toBeTruthy();
    expect(screen.getByTestId("stat-cards").textContent).toBe("New leads0This weekAppointments0TodayRevenue$0This week · completedCompleted jobs0This week");
  });

  it("phones: bottom nav, More opens every section (Expenses is scoped to the shop)", async () => {
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([]);
    mocks.fetchTenantExpenses.mockResolvedValue([]);
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    await screen.findByText("Nothing booked for today.");
    expect(screen.queryByRole("complementary")).toBeNull(); // no sidebar on phones
    fireEvent.click(screen.getByText("More"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Expenses"));
    await vi.waitFor(() => expect(mocks.fetchTenantExpenses).toHaveBeenCalledWith("t-juan"));
  });

  it("desktop: left sidebar with Analytics; analytics show real follow-through and services", async () => {
    setDesktop(true);
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([
      bk({ id: "b1", status: "completed", booking_date: "2026-01-05" }),
      bk({ id: "b2", status: "cancelled", booking_date: "2026-01-06" }),
    ]);
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    const side = screen.getByRole("complementary", { name: "Dashboard navigation" });
    await screen.findByText("Today's Schedule");
    fireEvent.click(within(side).getByText("Analytics"));
    expect(screen.getByTestId("follow-through").textContent).toBe("50%");
    expect(screen.getByTestId("avg-price").textContent).toBe("$180");
    expect(screen.getByLabelText("Most popular services").textContent).toMatch(/Regular1 booked · \$180/);
  });

  it("customers: light table with status pills, search, details with Reschedule; phones never tel:/sms:", async () => {
    setDesktop(true);
    mocks.tenant = juan;
    mocks.fetchTenantVehicles.mockResolvedValue([{ id: "v1", profile_id: "p-ana", label: "2019 Honda CR-V", notes: "Dog hair" }]);
    mocks.fetchTenantBookings.mockResolvedValue([
      bk({ id: "b1", booking_date: "2099-01-04" }),
      bk({ id: "b0", status: "completed", booking_date: "2026-01-04" }),
      bk({ id: "b9", profile_id: "p-bo", status: "declined", profiles: { full_name: "Bo Lee", source: "staff" }, vehicles: { label: "F-150" } }),
    ]);
    const { container } = render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    await screen.findByText("Today's Schedule");
    fireEvent.change(screen.getByLabelText("Search customers"), { target: { value: "f-150" } });
    await screen.findByText("1 of 2 customers");
    expect(container.querySelector('tbody [data-status="declined"]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search customers"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Ana Ruiz" }));
    expect(screen.getByText("Service History")).toBeTruthy();
    expect(screen.getByDisplayValue("Dog hair")).toBeTruthy();
    fireEvent.click(screen.getByText("Reschedule"));
    expect(screen.getByText("Pick a time")).toBeTruthy(); // the RescheduleForm opened for the upcoming booking
    expect(container.innerHTML).not.toMatch(/href="(tel|sms):/i);
    expect(screen.getByText(/Open Google Voice/).closest("a").getAttribute("href")).toMatch(/^https:\/\/voice\.google\.com/);
  });

  it("sign out uses the dashboard's onSignOut (which goes to /login)", async () => {
    setDesktop(true);
    mocks.tenant = juan;
    mocks.fetchTenantBookings.mockResolvedValue([]);
    const onSignOut = vi.fn();
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByText("Sign out"));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe("shared desktop layout (all shops)", () => {
  const nav = [{ key: "a", label: "Alpha", row: 0 }, { key: "b", label: "Beta", row: 1 }];
  it("phones: narrow column with the tab rows, no sidebar", () => {
    const { container } = render(<DashboardLayout title="Shop" nav={nav} active="a" onSelect={() => {}} onSignOut={() => {}}>x</DashboardLayout>);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.querySelector("main").className).toMatch(/max-w-md/);
    expect(container.querySelectorAll("main > div.flex.gap-1")).toHaveLength(2);
  });
  it("desktop (>=1024px): left sidebar and a wide main area", () => {
    setDesktop(true);
    const onSelect = vi.fn();
    const { container } = render(<DashboardLayout title="Shop" nav={nav} active="a" onSelect={onSelect} onSignOut={() => {}}>x</DashboardLayout>);
    const side = screen.getByRole("complementary", { name: "Dashboard navigation" });
    fireEvent.click(within(side).getByText("Beta"));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(container.querySelector("main").className).toMatch(/lg:max-w-6xl/);
    expect(container.querySelectorAll("main > div.flex.gap-1")).toHaveLength(0);
  });
});

describe("mobile service address is shown to the owner", () => {
  it("on the silver overview (Juan) and on the standard Schedule tab (other shops)", async () => {
    const mob = bk({ id: "m1", type: "mobile", mobile_address: "12 Oak St, Tremonton 84337" });
    mocks.tenant = { id: "t-juan", slug: "juans-auto-detailing", industry: "auto_detailing" };
    mocks.fetchTenantBookings.mockResolvedValue([mob]);
    const a = render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    expect(await screen.findByText(/12 Oak St, Tremonton 84337/)).toBeTruthy();
    a.unmount();
    mocks.tenant = { id: "t-other", slug: "shine-shop", industry: "auto_detailing" };
    render(<AdminDashboard session={{ user: { id: "u" } }} onSignOut={vi.fn()} />);
    fireEvent.click(await screen.findByText("Schedule"));
    expect(await screen.findByText(/12 Oak St, Tremonton 84337/)).toBeTruthy();
  });
});
