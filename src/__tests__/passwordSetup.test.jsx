import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// --- Mocks: nothing here talks to the real Supabase project or sends email. --
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  fetchProfile: vi.fn(),
  fetchTenantById: vi.fn(),
  link: { type: null, error: null },
  authListener: null,
}));

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      updateUser: mocks.updateUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      signOut: vi.fn(),
    },
  },
}));
vi.mock("../api/profiles.js", () => ({ fetchProfile: mocks.fetchProfile }));
vi.mock("../api/tenants.js", () => ({ fetchTenantById: mocks.fetchTenantById }));
vi.mock("../lib/authRedirect.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getPendingAuthLink: () => mocks.link,
    clearPendingAuthLink: () => { mocks.link = { type: null, error: null }; },
  };
});

import { readAuthLink, setPasswordPath, businessFromPath } from "../lib/authRedirect.js";
import { AuthProvider } from "../context/AuthContext.jsx";
import { AuthLinkGuard } from "../components/AuthLinkGuard.jsx";
import { SetPassword } from "../pages/SetPassword.jsx";
import { AuthScreen } from "../pages/AuthScreen.jsx";

const ORIGIN = window.location.origin;
const OWNER = { id: "u1", role: "business_owner", tenant_id: "t-juan" };
const SESSION = { user: { id: "u1", email: "owner@example.test" } };

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderApp(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthLinkGuard>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/crm/admin" element={<div>Admin home</div>} />
            <Route path="/crm/:slug/portal" element={<div>Customer portal</div>} />
            <Route path="/crm/:slug" element={<div>Owner dashboard</div>} />
          </Routes>
          <Where />
        </AuthLinkGuard>
      </MemoryRouter>
    </AuthProvider>
  );
}

const where = () => screen.getByTestId("where").textContent;

async function fillPasswords(a, b) {
  fireEvent.change(await screen.findByLabelText("New password"), { target: { value: a } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: b } });
  fireEvent.click(screen.getByText("Save password and continue"));
}

beforeEach(() => {
  mocks.link = { type: null, error: null };
  mocks.getSession.mockResolvedValue({ data: { session: SESSION } });
  mocks.onAuthStateChange.mockImplementation((cb) => {
    mocks.authListener = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.fetchProfile.mockResolvedValue(OWNER);
  mocks.fetchTenantById.mockResolvedValue({ id: "t-juan", slug: "juans-auto-detailing" });
  mocks.updateUser.mockResolvedValue({ data: { user: SESSION.user }, error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("readAuthLink (captured before supabase-js clears the hash)", () => {
  it.each([
    ["invite", { hash: "#access_token=abc&refresh_token=r&type=invite", search: "?business=x" }, { type: "invite", error: null }],
    ["recovery", { hash: "#access_token=abc&type=recovery", search: "" }, { type: "recovery", error: null }],
    [
      "expired link",
      { hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", search: "" },
      { type: null, error: "Email link is invalid or has expired" },
    ],
    ["error in the query string", { hash: "", search: "?error=access_denied&error_code=otp_expired" }, { type: null, error: "otp_expired" }],
    ["signup confirmation (not ours)", { hash: "#access_token=abc&type=signup", search: "" }, { type: null, error: null }],
    ["type without a token", { hash: "#type=invite", search: "" }, { type: null, error: null }],
    ["plain URL", { hash: "", search: "" }, { type: null, error: null }],
    ["unrelated ?error param", { hash: "", search: "?error=1" }, { type: null, error: null }],
  ])("%s", (_l, loc, expected) => {
    expect(readAuthLink(loc)).toEqual(expected);
  });

  it("builds the set-password path and reads the business from /crm paths", () => {
    expect(setPasswordPath()).toBe("/set-password");
    expect(setPasswordPath("juans-auto-detailing")).toBe("/set-password?business=juans-auto-detailing");
    expect(businessFromPath("/crm/apex/portal")).toBe("apex");
    expect(businessFromPath("/crm/admin")).toBe(null);
    expect(businessFromPath("/login")).toBe(null);
  });
});

describe("invite / recovery link routing", () => {
  it("an invite that lands on /login goes to /set-password instead of the dashboard", async () => {
    mocks.link = { type: "invite", error: null };
    renderApp("/login");
    expect(await screen.findByText("Welcome! Set your password")).toBeTruthy();
    expect(where()).toBe("/set-password");
    expect(screen.queryByText("Login page")).toBeNull();
    expect(screen.getByText("owner@example.test")).toBeTruthy();
  });

  it("keeps the business branding when the link lands on a /crm/<slug> page", async () => {
    mocks.link = { type: "recovery", error: null };
    renderApp("/crm/juans-auto-detailing/portal");
    expect(await screen.findByText("Choose a new password")).toBeTruthy();
    expect(where()).toBe("/set-password?business=juans-auto-detailing");
    expect(screen.getByAltText("Juan's Auto Detailing")).toBeTruthy();
  });

  it("does nothing without a link", async () => {
    renderApp("/login");
    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(where()).toBe("/login");
  });

  it("a PASSWORD_RECOVERY event also routes to /set-password", async () => {
    renderApp("/login");
    await screen.findByText("Login page");
    mocks.authListener("PASSWORD_RECOVERY", SESSION);
    expect(await screen.findByText("Choose a new password")).toBeTruthy();
    expect(where()).toBe("/set-password");
  });
});

describe("Set your password screen", () => {
  it("rejects short and mismatched passwords without calling Supabase", async () => {
    mocks.link = { type: "invite", error: null };
    renderApp("/set-password?business=juans-auto-detailing");
    await fillPasswords("short", "short");
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();
    await fillPasswords("longenough1", "longenough2");
    expect(await screen.findByText("Passwords don't match.")).toBeTruthy();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("an invited owner sets a password and lands on their business dashboard", async () => {
    mocks.link = { type: "invite", error: null };
    renderApp("/set-password?business=juans-auto-detailing");
    await fillPasswords("correct horse", "correct horse");
    expect(await screen.findByText("Owner dashboard")).toBeTruthy();
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "correct horse" });
    expect(mocks.fetchTenantById).toHaveBeenCalledWith("t-juan");
    expect(where()).toBe("/crm/juans-auto-detailing");
  });

  it.each([
    ["customer", { role: "customer", tenant_id: "t-juan" }, "/crm/juans-auto-detailing/portal"],
    ["staff", { role: "staff", tenant_id: "t-juan" }, "/crm/juans-auto-detailing"],
    ["Potentia admin", { role: "potentia_admin", tenant_id: null }, "/crm/admin"],
  ])("a %s goes to their home after a reset", async (_l, profile, path) => {
    mocks.link = { type: "recovery", error: null };
    mocks.fetchProfile.mockResolvedValue({ id: "u1", ...profile });
    renderApp("/set-password");
    await fillPasswords("new password!", "new password!");
    await waitFor(() => expect(where()).toBe(path));
  });

  it("shows Supabase errors and stays on the page", async () => {
    mocks.link = { type: "recovery", error: null };
    mocks.updateUser.mockResolvedValue({ data: null, error: new Error("New password should be different from the old password.") });
    renderApp("/set-password");
    await fillPasswords("same password", "same password");
    expect(await screen.findByText("New password should be different from the old password.")).toBeTruthy();
    expect(where()).toBe("/set-password");
  });

  it("an expired link offers a new reset link (branded redirect) and can leave to sign in", async () => {
    mocks.link = { type: null, error: "Email link is invalid or has expired" };
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderApp("/login?business=juans-auto-detailing");
    expect(await screen.findByText("This link has expired")).toBeTruthy();
    expect(where()).toBe("/set-password?business=juans-auto-detailing");

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "juan@example.test" } });
    fireEvent.click(screen.getByText("Send reset link"));
    expect(await screen.findByTestId("reset-sent")).toBeTruthy();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("juan@example.test", {
      redirectTo: `${ORIGIN}/set-password?business=juans-auto-detailing`,
    });

    fireEvent.click(screen.getByText("Go to sign in"));
    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(where()).toBe("/login");
  });

  it("without a link or session, explains how to get one", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderApp("/set-password");
    expect(await screen.findByText(/Open the link in your email/)).toBeTruthy();
    expect(screen.getByAltText("Potentia")).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});

describe("Forgot password? on the sign-in form", () => {
  function Screen({ tenantSlug, initial = "login" }) {
    const [mode, setMode] = useState(initial);
    return <AuthScreen mode={mode} setMode={setMode} onAuthed={vi.fn()} onBack={vi.fn()} setGlobalError={vi.fn()} tenantSlug={tenantSlug} allowSignup={false} />;
  }

  it.each([
    ["the Potentia login", undefined, `${ORIGIN}/set-password`],
    ["a business login", "route-six", `${ORIGIN}/set-password?business=route-six`],
  ])("on %s it emails a reset link that returns to /set-password", async (_l, slug, redirectTo) => {
    render(<Screen tenantSlug={slug} />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "owner@example.test" } });
    fireEvent.click(screen.getByText("Forgot password?"));
    expect(screen.getByText("Reset your password")).toBeTruthy();
    // The email typed on the sign-in form carries over.
    expect(screen.getByPlaceholderText("Email").value).toBe("owner@example.test");
    fireEvent.click(screen.getByText("Send reset link"));
    expect(await screen.findByText(/If there's an account for owner@example.test/)).toBeTruthy();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner@example.test", { redirectTo });

    fireEvent.click(screen.getByText("Back to sign in"));
    expect(screen.getByText("Sign in", { selector: "h1" })).toBeTruthy();
  });

  it("shows a friendly message when rate limited", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: null, error: Object.assign(new Error("rate limit"), { status: 429 }) });
    render(<Screen initial="forgot" />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.test" } });
    fireEvent.click(screen.getByText("Send reset link"));
    expect(await screen.findByText(/Too many requests/)).toBeTruthy();
    expect(screen.queryByTestId("reset-sent")).toBeNull();
  });

  it("is only on the sign-in form, not sign-up", () => {
    render(<Screen initial="signup" />);
    expect(screen.queryByText("Forgot password?")).toBeNull();
  });
});
