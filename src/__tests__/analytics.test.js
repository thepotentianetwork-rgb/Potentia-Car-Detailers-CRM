import { describe, it, expect } from "vitest";
import { dashboardStats, todaysSchedule, pipelineCounts, recentActivity, analytics, weekStart, customerRows } from "../lib/analytics.js";

// Wed 2026-10-14 10:00 in Denver (16:00 UTC). Week = Mon 10-12 .. Sun 10-18.
const NOW = new Date("2026-10-14T16:00:00Z");
const TZ = "America/Denver";
const b = (o) => ({ id: o.id, profile_id: "p1", status: "approved", booking_date: "2026-10-14", start_time: "09:00:00", price_cents: 10000,
  profiles: { full_name: "Ana Ruiz", source: "guest" }, services: { name: "Regular" }, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", ...o });

describe("dashboard stats", () => {
  it("counts this week's leads, today's appointments, and this week's completed revenue/jobs", () => {
    const rows = [
      b({ id: 1, created_at: "2026-10-13T15:00:00Z" }), // lead this week, today
      b({ id: 2, status: "pending", created_at: "2026-10-12T07:00:00Z", booking_date: "2026-10-20" }), // Mon 1AM Denver = this week
      b({ id: 3, status: "completed", booking_date: "2026-10-12", price_cents: 24000, created_at: "2026-10-12T05:00:00Z" }), // Sun 11PM Denver: last week's lead
      b({ id: 4, status: "completed", booking_date: "2026-10-11", price_cents: 99900 }), // last week
      b({ id: 5, status: "declined" }), // today but declined
      b({ id: 6, status: "completed", booking_date: "2026-10-14", price_cents: 5000 }),
    ];
    expect(dashboardStats(rows, NOW, TZ)).toEqual({ newLeadsWeek: 2, appointmentsToday: 2, revenueWeekCents: 29000, completedWeek: 2 });
  });

  it("is all zeros with no bookings", () => {
    expect(dashboardStats([], NOW, TZ)).toEqual({ newLeadsWeek: 0, appointmentsToday: 0, revenueWeekCents: 0, completedWeek: 0 });
  });

  it("weeks start on Monday", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });
});

describe("schedule, pipeline, activity", () => {
  it("today's schedule is sorted by time and skips declined/cancelled", () => {
    const rows = [b({ id: 1, start_time: "13:00:00" }), b({ id: 2, start_time: "08:00:00", status: "pending" }), b({ id: 3, status: "cancelled" }), b({ id: 4, booking_date: "2026-10-15" })];
    expect(todaysSchedule(rows, NOW, TZ).map((x) => x.id)).toEqual([2, 1]);
  });

  it("pipeline counts every real status", () => {
    const rows = [b({ id: 1, status: "pending" }), b({ id: 2, status: "pending" }), b({ id: 3 }), b({ id: 4, status: "completed" }), b({ id: 5, status: "cancelled" })];
    expect(Object.fromEntries(pipelineCounts(rows).map((s) => [s.status, s.count]))).toEqual({ pending: 2, approved: 1, completed: 1, declined: 0, cancelled: 1 });
  });

  it("recent activity comes from created_at and completed jobs, newest first", () => {
    const rows = [
      b({ id: 1, created_at: "2026-10-10T10:00:00Z" }),
      b({ id: 2, status: "completed", paid: true, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-13T10:00:00Z" }),
      b({ id: 3, profiles: { full_name: "Bo", source: "staff" }, created_at: "2026-10-12T10:00:00Z" }),
    ];
    const ev = recentActivity(rows);
    expect(ev.map((e) => e.title)).toEqual(["Job completed · paid", "Booking added by staff", "New booking request", "New booking request"]);
  });
});

describe("analytics", () => {
  it("follow-through counts completed out of jobs that came due (declined excluded)", () => {
    const rows = [
      b({ id: 1, status: "completed", booking_date: "2026-10-01" }),
      b({ id: 2, status: "completed", booking_date: "2026-10-02" }),
      b({ id: 3, status: "cancelled", booking_date: "2026-10-03" }),
      b({ id: 4, status: "approved", booking_date: "2026-10-04" }), // past, not marked done
      b({ id: 5, status: "approved", booking_date: "2026-10-20" }), // upcoming: not due
      b({ id: 6, status: "declined", booking_date: "2026-10-05" }),
    ];
    const a = analytics(rows, NOW, TZ);
    expect(a.followThroughRate).toBe(0.5);
    expect([a.completed, a.cancelled, a.declined, a.notMarked, a.upcoming]).toEqual([2, 1, 1, 1, 1]);
    expect(a.avgPriceCents).toBe(10000);
  });

  it("no completed jobs: no rate and no average (never a fake 0%)", () => {
    const a = analytics([b({ id: 1, booking_date: "2026-10-20" })], NOW, TZ);
    expect(a.followThroughRate).toBeNull();
    expect(a.avgPriceCents).toBeNull();
  });

  it("popular services use booking_services, and service + add-ons for older bookings", () => {
    const rows = [
      b({ id: 1, status: "completed", price_cents: 30000, booking_services: [
        { id: "s1", service_id: "x", name: "Full Detail", price_cents: 25000, position: 0 },
        { id: "s2", service_id: "y", name: "Pet Hair Removal", price_cents: 5000, position: 1 }] }),
      b({ id: 2, status: "completed", price_cents: 30000, services: { name: "Full Detail" },
        booking_addons: [{ id: "a1", name: "Pet Hair Removal", price_cents: 4000 }] }),
      b({ id: 3, status: "approved", services: { name: "Full Detail" } }),
      b({ id: 4, status: "declined", services: { name: "Odor Removal" } }),
    ];
    const s = analytics(rows, NOW, TZ).services;
    expect(s).toEqual([
      { name: "Full Detail", count: 3, revenueCents: 25000 + 26000 },
      { name: "Pet Hair Removal", count: 2, revenueCents: 9000 },
    ]);
  });

  it("weekly revenue trend, repeat vs one-time customers, and booking source", () => {
    const rows = [
      b({ id: 1, status: "completed", booking_date: "2026-10-13", price_cents: 10000, profile_id: "p1" }),
      b({ id: 2, status: "completed", booking_date: "2026-10-06", price_cents: 20000, profile_id: "p1" }),
      b({ id: 3, status: "completed", booking_date: "2026-10-07", price_cents: 5000, profile_id: "p2", profiles: { source: "staff" } }),
      b({ id: 4, status: "pending", profile_id: "p3", profiles: { source: "account" } }),
    ];
    const a = analytics(rows, NOW, TZ, 3);
    expect(a.trend).toEqual([
      { start: "2026-09-28", revenueCents: 0, jobs: 0 },
      { start: "2026-10-05", revenueCents: 25000, jobs: 2 },
      { start: "2026-10-12", revenueCents: 10000, jobs: 1 },
    ]);
    expect([a.repeatCustomers, a.newCustomers, a.repeatRevenueCents, a.newRevenueCents]).toEqual([1, 1, 30000, 5000]);
    expect(Object.fromEntries(a.sources.map((x) => [x.key, x.count]))).toEqual({ guest: 2, staff: 1, account: 1 });
  });

  it("customer rows: latest booking, upcoming appointment and history", () => {
    const rows = [
      b({ id: 1, status: "completed", booking_date: "2026-10-01" }),
      b({ id: 2, status: "approved", booking_date: "2026-10-20", vehicles: { label: "2020 Tacoma" } }),
    ];
    const [c] = customerRows(rows, "2026-10-14");
    expect(c.latest.id).toBe(2);
    expect(c.upcoming.id).toBe(2);
    expect(c.history.map((x) => x.id)).toEqual([1]);
    expect(c.vehicle).toBe("2020 Tacoma");
    expect(c.spendCents).toBe(10000);
  });
});
