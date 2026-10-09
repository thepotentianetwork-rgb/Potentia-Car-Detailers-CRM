import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Supabase client mock: records every call, never hits the network. ------
const calls = vi.hoisted(() => ({ list: [], result: { data: null, error: null } }));

vi.mock("../lib/supabaseClient.js", () => {
  const chain = (table) => {
    const q = {};
    for (const m of ["select", "insert", "update", "eq", "in", "order", "single"]) {
      q[m] = (...args) => { calls.list.push({ table, m, args }); return q; };
    }
    q.then = (resolve, reject) => Promise.resolve(calls.result).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      from: (table) => { calls.list.push({ table, m: "from" }); return chain(table); },
      rpc: vi.fn(async (...args) => { calls.list.push({ m: "rpc", args }); return calls.result; }),
      auth: { signUp: vi.fn(async (...args) => { calls.list.push({ m: "signUp", args }); return { data: { session: null }, error: null }; }) },
    },
  };
});

import { requestBooking, fetchTenantBookings } from "../api/bookings.js";
import { fetchTenantExpenses } from "../api/expenses.js";
import { fetchTenantVehicles } from "../api/vehicles.js";
import { createGuestCustomer } from "../api/profiles.js";
import { signUp } from "../api/auth.js";
import { toConfig } from "../context/TenantContext.jsx";

const call = (m) => calls.list.find((c) => c.m === m);

beforeEach(() => {
  calls.list = [];
  calls.result = { data: null, error: null };
});

describe("requestBooking()", () => {
  const base = {
    tenantSlug: "shine", serviceId: "svc-1", bookingDate: "2026-10-08", startTime: "14:00:00",
    type: "dropoff", vehicleLabel: "2020 Honda Civic", vehicleColor: "Blue", mobileAddress: "should be dropped",
  };

  it("calls the request_booking database function with the guest's details", async () => {
    calls.result = { data: [{ booking_id: "b-1", status: "pending" }], error: null };
    const row = await requestBooking({ ...base, guestName: "Gina Guest", guestPhone: "5552010001", guestEmail: "gina@example.com", guestZip: "80202" });
    expect(call("rpc").args).toEqual(["request_booking", {
      p_tenant_slug: "shine", p_service_id: "svc-1", p_booking_date: "2026-10-08", p_start_time: "14:00:00",
      p_type: "dropoff", p_vehicle_label: "2020 Honda Civic", p_vehicle_color: "Blue", p_mobile_address: null,
      p_guest_name: "Gina Guest", p_guest_phone: "5552010001", p_guest_email: "gina@example.com", p_guest_zip: "80202",
    }]);
    expect(row).toEqual({ booking_id: "b-1", status: "pending" });
  });

  it("sends no guest fields for a signed-in customer and never price/status (the server sets those)", async () => {
    calls.result = { data: [{ booking_id: "b-2" }], error: null };
    await requestBooking({ ...base, type: "mobile", mobileAddress: "1 Main St", vehicleColor: "" });
    const params = call("rpc").args[1];
    expect(params).toMatchObject({ p_type: "mobile", p_mobile_address: "1 Main St", p_vehicle_color: null,
      p_guest_name: null, p_guest_phone: null, p_guest_email: null, p_guest_zip: null });
    expect(Object.keys(params).some((k) => /price|status|duration/.test(k))).toBe(false);
    expect(calls.list.some((c) => c.m === "from")).toBe(false);
  });

  it("throws the server's message so the customer sees it", async () => {
    calls.result = { data: null, error: new Error("Sorry, that time was just taken. Pick another.") };
    await expect(requestBooking(base)).rejects.toThrow("just taken");
  });
});

describe("fetchTenantBookings()", () => {
  it("loads guest contact info and the vehicle for the owner's Requests tab", async () => {
    calls.result = { data: [], error: null };
    await fetchTenantBookings("t-1");
    const select = calls.list.find((c) => c.table === "bookings" && c.m === "select").args[0];
    expect(select).toMatch(/profiles!profile_id\(full_name,phone,email,zip,source\)/);
    expect(select).toMatch(/vehicles\(label,color\)/);
    expect(select).toMatch(/staff:profiles!staff_id\(full_name\)/);
    expect(select).toMatch(/services\(name\)/);
  });
});

describe("createGuestCustomer()", () => {
  it("labels customers the shop enters by hand as source 'staff'", async () => {
    calls.result = { data: { id: "p-1" }, error: null };
    await createGuestCustomer("tenant-1", "Jamie Rivera", "555-123-4567");
    const insert = calls.list.find((c) => c.table === "profiles" && c.m === "insert").args[0];
    expect(insert).toEqual({ tenant_id: "tenant-1", full_name: "Jamie Rivera", phone: "555-123-4567", role: "customer", source: "staff" });
  });
});

describe("signUp()", () => {
  it("sends phone and ZIP as signup metadata for the profile trigger", async () => {
    await signUp("new@example.com", "secret1", "New Person", "shine", { phone: "5552010099", zip: "80301" });
    expect(call("signUp").args[0]).toEqual({
      email: "new@example.com",
      password: "secret1",
      options: { data: { full_name: "New Person", tenant_slug: "shine", phone: "5552010099", zip: "80301" } },
    });
  });
});

describe("tenant config", () => {
  it("exposes the business timezone, defaulting to America/Denver", () => {
    expect(toConfig({ name: "Shine", timezone: "America/Phoenix" }).timezone).toBe("America/Phoenix");
    expect(toConfig({ name: "Shine" }).timezone).toBe("America/Denver");
    expect(toConfig({ name: "Shine", timezone: null }).timezone).toBe("America/Denver");
  });
});

// The Potentia admin can read every business under RLS, so the owner
// dashboard's reads must filter by the business in the URL themselves.
describe("owner dashboard reads are scoped to one business", () => {
  it.each([
    ["bookings", fetchTenantBookings],
    ["expenses", fetchTenantExpenses],
    ["vehicles", fetchTenantVehicles],
  ])("%s: filters on tenant_id", async (table, fn) => {
    calls.list = [];
    calls.result = { data: [], error: null };
    await fn("t-juan");
    const eqs = calls.list.filter((c) => c.table === table && c.m === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["tenant_id", "t-juan"]);
  });

  it.each([
    ["bookings", fetchTenantBookings],
    ["expenses", fetchTenantExpenses],
    ["vehicles", fetchTenantVehicles],
  ])("%s: refuses to run without a business id", async (table, fn) => {
    calls.list = [];
    await expect(fn(undefined)).rejects.toThrow(/business id/);
    expect(calls.list.some((c) => c.table === table && c.m === "select")).toBe(false);
  });
});
