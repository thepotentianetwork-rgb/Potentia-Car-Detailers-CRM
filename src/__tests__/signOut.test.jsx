import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// --- Mocks: nothing here talks to the real Supabase project. ---------------
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authSignOut: vi.fn(),
  fetchProfile: vi.fn(),
}));

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.authSignOut,
    },
  },
}));

vi.mock("../api/profiles.js", () => ({ fetchProfile: mocks.fetchProfile }));

vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", name: "Shine Shop", industry: "detailing" },
    config: { businessName: "Shine Shop" },
  }),
}));

// Heavy screens are stubbed; the stubs wire onSignOut straight to a button the
// same way the real dashboards do (onClick={onSignOut}).
vi.mock("../pages/AuthScreen.jsx", () => ({ AuthScreen: () => <div>Sign-in form</div> }));
vi.mock("../pages/admin/AdminDashboard.jsx", () => ({
  AdminDashboard: ({ onSignOut }) => <button onClick={onSignOut}>Dashboard sign out</button>,
}));
vi.mock("../pages/admin/DealershipDashboard.jsx", () => ({
  DealershipDashboard: ({ onSignOut }) => <button onClick={onSignOut}>Dashboard sign out</button>,
}));
vi.mock("../pages/potentia/PotentiaAdminDashboard.jsx", () => ({
  PotentiaAdminDashboard: ({ onSignOut }) => <button onClick={onSignOut}>Dashboard sign out</button>,
}));
vi.mock("../pages/Homepage.jsx", () => ({ Homepage: () => <div>Shop homepage</div> }));
vi.mock("../pages/BookingFlow.jsx", () => ({ BookingFlow: () => <div>Booking flow</div> }));
vi.mock("../pages/Confirmed.jsx", () => ({ Confirmed: () => <div>Confirmed</div> }));

import { AuthProvider, useAuth, resolveSignOutRedirect } from "../context/AuthContext.jsx";
import { OwnerDashboardRoute } from "../pages/OwnerDashboardRoute.jsx";
import { CustomerPortal } from "../pages/CustomerPortal.jsx";
import { PotentiaAdminApp } from "../pages/potentia/PotentiaAdminApp.jsx";

const AGENCY = "https://www.potentianetwork.com";
const APP_URL = "https://crm.example.test/crm/shine/portal";

// --- window.location stub ----------------------------------------------------
let originalLocation;
let loc;

beforeEach(() => {
  originalLocation = window.location;
  loc = { href: APP_URL, replace: vi.fn(), assign: vi.fn(), reload: vi.fn() };
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: loc });

  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.authSignOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function expectNoNavigation() {
  expect(loc.replace).not.toHaveBeenCalled();
  expect(loc.assign).not.toHaveBeenCalled();
  expect(loc.href).toBe(APP_URL);
}

function expectAgencyRedirect() {
  expect(loc.replace).toHaveBeenCalledTimes(1);
  expect(loc.replace).toHaveBeenCalledWith(AGENCY);
  expect(loc.assign).not.toHaveBeenCalled();
  expect(loc.href).toBe(APP_URL);
}

function renderAt(path, routePath, element) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

// Exposes signOut directly, used both as onClick={signOut} and with options.
function Probe() {
  const { session, signOut } = useAuth();
  return (
    <div>
      <span>{session ? "signed-in" : "signed-out"}</span>
      <button onClick={signOut}>default</button>
      <button onClick={() => signOut({ redirectTo: null })}>stay</button>
    </div>
  );
}

async function renderProbe() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await screen.findByText("signed-in");
}

describe("owner / staff / admin sign-out", () => {
  it.each([
    ["business owner (detailing dashboard)", "business_owner"],
    ["staff", "staff"],
  ])("%s: dashboard sign-out redirects to the agency site with location.replace", async (_label, role) => {
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role, tenant_id: "tenant-1" });
    renderAt("/crm/shine", "/crm/:tenantSlug", <OwnerDashboardRoute />);

    fireEvent.click(await screen.findByText("Dashboard sign out"));

    await waitFor(() => expect(loc.replace).toHaveBeenCalled());
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectAgencyRedirect();
  });

  it("Potentia admin: dashboard sign-out redirects to the agency site with location.replace", async () => {
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "potentia_admin", tenant_id: null });
    renderAt("/crm/admin", "/crm/admin", <PotentiaAdminApp />);

    fireEvent.click(await screen.findByText("Dashboard sign out"));

    await waitFor(() => expect(loc.replace).toHaveBeenCalled());
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectAgencyRedirect();
  });

  it("onClick={signOut} (receives a click event, not options) clears the session and redirects", async () => {
    await renderProbe();
    fireEvent.click(screen.getByText("default"));

    await screen.findByText("signed-out");
    expectAgencyRedirect();
  });
});

describe("signOut({ redirectTo: null })", () => {
  it("signs out and clears the session without leaving the page", async () => {
    await renderProbe();
    fireEvent.click(screen.getByText("stay"));

    await screen.findByText("signed-out");
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectNoNavigation();
  });

  it("still clears the session and stays put when the sign-out request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.authSignOut.mockResolvedValue({ error: new Error("network down") });
    await renderProbe();
    fireEvent.click(screen.getByText("stay"));

    await screen.findByText("signed-out");
    expectNoNavigation();
  });
});

describe("sign-out errors", () => {
  it("a failed sign-out request still clears the local session and redirects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.authSignOut.mockResolvedValue({ error: new Error("network down") });
    await renderProbe();
    fireEvent.click(screen.getByText("default"));

    await screen.findByText("signed-out");
    expectAgencyRedirect();
  });
});

describe("'wrong account' screens stay on the page", () => {
  it("owner route: signing out of an account without access shows the sign-in form again", async () => {
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "business_owner", tenant_id: "other-tenant" });
    renderAt("/crm/shine", "/crm/:tenantSlug", <OwnerDashboardRoute />);

    fireEvent.click(await screen.findByText("Sign out"));

    await screen.findByText("Sign-in form");
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectNoNavigation();
  });

  it("admin route: signing out of a non-admin account shows the sign-in form again", async () => {
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "business_owner", tenant_id: "tenant-1" });
    renderAt("/crm/admin", "/crm/admin", <PotentiaAdminApp />);

    fireEvent.click(await screen.findByText("Sign out"));

    await screen.findByText("Sign-in form");
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectNoNavigation();
  });
});

describe("customer portal sign-out", () => {
  it("stays on the shop's portal (no redirect) and returns to the shop homepage, even mid-booking", async () => {
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "customer", tenant_id: "tenant-1" });
    renderAt("/crm/shine/portal", "/crm/:tenantSlug/portal", <CustomerPortal />);

    // Go into the booking flow, then sign out from the header.
    fireEvent.click(await screen.findByText("My Account"));
    await screen.findByText("Booking flow");
    const headerSignOut = screen.getAllByRole("button").find((b) => b.textContent.trim() === "");
    fireEvent.click(headerSignOut);

    await screen.findByText("Shop homepage");
    expect(screen.getByText("Log In")).toBeTruthy();
    expect(mocks.authSignOut).toHaveBeenCalledTimes(1);
    expectNoNavigation();
  });
});

describe("resolveSignOutRedirect (what signOut does with its argument)", () => {
  it("treats no argument and click events as 'use the default agency redirect'", () => {
    expect(resolveSignOutRedirect()).toBe(AGENCY);
    expect(resolveSignOutRedirect({})).toBe(AGENCY);
    // Even an event that happens to carry a redirectTo property is not options.
    expect(resolveSignOutRedirect(Object.assign(new Event("click"), { redirectTo: null }))).toBe(AGENCY);
    expect(resolveSignOutRedirect({ nativeEvent: {}, type: "click", redirectTo: null })).toBe(AGENCY);
  });

  it("honours an explicit options object", () => {
    expect(resolveSignOutRedirect({ redirectTo: null })).toBe(null);
    expect(resolveSignOutRedirect({ redirectTo: "https://example.test/" })).toBe("https://example.test/");
  });
});
