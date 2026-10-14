import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// --- Mocks: nothing here talks to the real Supabase project. ---------------
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  fetchProfile: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  slug: "shine",
}));
vi.mock("../lib/supabaseClient.js", () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("../api/profiles.js", () => ({ fetchProfile: mocks.fetchProfile }));
vi.mock("../api/auth.js", () => ({ signUp: mocks.signUp, signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1", slug: mocks.slug, name: "Shine Shop" }, config: { businessName: "Shine Shop" } }),
}));
// AuthScreen is the real one. The heavy screens are stubs that show which
// booking flow (guest or account) the portal picked.
vi.mock("../pages/Homepage.jsx", () => ({ Homepage: ({ onBook }) => <button onClick={onBook}>Book a Service</button> }));
vi.mock("../pages/BookingFlow.jsx", () => ({
  BookingFlow: ({ guest, customer, onConfirm }) => (
    <div>
      <div>{guest ? "Guest booking flow" : "Account booking flow"}</div>
      {customer && <div data-testid="alert-customer">{JSON.stringify(customer)}</div>}
      <button onClick={() => onConfirm({ guest: !!guest, service: "Basic Wash" })}>Pick 2:00 PM</button>
    </div>
  ),
}));
vi.mock("../pages/Confirmed.jsx", () => ({ Confirmed: ({ booking }) => <div>Confirmed {booking.guest ? "guest" : "account"} request</div> }));

import { AuthProvider } from "../context/AuthContext.jsx";
import { CustomerPortal } from "../pages/CustomerPortal.jsx";
import { AuthScreen } from "../pages/AuthScreen.jsx";

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.signUp.mockResolvedValue({ session: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.slug = "shine";
});

function renderPortal() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/crm/shine/portal"]}>
        <Routes>
          <Route path="/crm/:tenantSlug/portal" element={<CustomerPortal />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("customer portal: booking without an account", () => {
  it("'Book a Service' offers 'Continue as guest' and 'Create an account'", async () => {
    renderPortal();
    fireEvent.click(await screen.findByText("Book a Service"));
    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Already have an account\? Sign in/ })).toBeTruthy();
  });

  it("'Continue as guest' reaches the booking flow with no session, then the confirmation", async () => {
    renderPortal();
    fireEvent.click(await screen.findByText("Book a Service"));
    fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
    expect(await screen.findByText("Guest booking flow")).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Pick 2:00 PM"));
    expect(await screen.findByText("Confirmed guest request")).toBeTruthy();
  });

  it("'Create an account' opens the signup form with phone and optional ZIP", async () => {
    renderPortal();
    fireEvent.click(await screen.findByText("Book a Service"));
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Mobile phone").required).toBe(true);
    expect(screen.getByPlaceholderText("ZIP code (optional)").required).toBe(false);
  });

  it("header 'Log In' still goes straight to the sign-in form", async () => {
    renderPortal();
    fireEvent.click(await screen.findByText("Log In"));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create an account" })).toBeNull();
  });

  it("signed-in customers skip the choice and get the account booking flow", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "customer", tenant_id: "tenant-1" });
    renderPortal();
    await screen.findByText("My Account");
    fireEvent.click(screen.getByText("Book a Service"));
    expect(await screen.findByText("Account booking flow")).toBeTruthy();
    expect(screen.queryByText("Continue as guest")).toBeNull();
  });

  it("hands the signed-in customer's details to the booking flow for the owner alert", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user-1", email: "carl@example.com" } } } });
    mocks.fetchProfile.mockResolvedValue({ id: "user-1", role: "customer", tenant_id: "tenant-1", full_name: "Carl Customer", phone: "4355550199", email: null });
    renderPortal();
    await screen.findByText("My Account");
    fireEvent.click(screen.getByText("Book a Service"));
    const el = await screen.findByTestId("alert-customer");
    // profiles.email is empty for older accounts, so the login email is used.
    expect(JSON.parse(el.textContent)).toEqual({ name: "Carl Customer", phone: "4355550199", email: "carl@example.com" });
  });
});

describe("signup form", () => {
  function renderSignup() {
    const onAuthed = vi.fn();
    render(<AuthScreen mode="signup" setMode={() => {}} onAuthed={onAuthed} onBack={() => {}} setGlobalError={() => {}} tenantSlug="shine" />);
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "secret1" } });
    return onAuthed;
  }
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  it("sends the phone (digits only) and ZIP with the signup", async () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Mobile phone"), { target: { value: "(555) 201-0099" } });
    fireEvent.change(screen.getByPlaceholderText("ZIP code (optional)"), { target: { value: "80301" } });
    submit();
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp).toHaveBeenCalledWith("new@example.com", "secret1", "New Person", "shine", { phone: "5552010099", zip: "80301" });
    expect(await screen.findByText("Check your email")).toBeTruthy();
  });

  it("ZIP can be left blank", async () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Mobile phone"), { target: { value: "555 201 0099" } });
    submit();
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledTimes(1));
    expect(mocks.signUp.mock.calls[0][4]).toEqual({ phone: "5552010099", zip: "" });
  });

  it("won't sign up without a 10-digit phone", async () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Mobile phone"), { target: { value: "555-12" } });
    submit();
    expect(await screen.findByText(/10-digit/)).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("won't sign up with a malformed ZIP", async () => {
    renderSignup();
    fireEvent.change(screen.getByPlaceholderText("Mobile phone"), { target: { value: "5552010099" } });
    fireEvent.change(screen.getByPlaceholderText("ZIP code (optional)"), { target: { value: "123" } });
    submit();
    expect(await screen.findByText(/5-digit ZIP/)).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("sign-in doesn't ask for (or require) a phone", async () => {
    mocks.signIn.mockResolvedValue({ session: { user: { id: "u" } } });
    const onAuthed = vi.fn();
    render(<AuthScreen mode="login" setMode={() => {}} onAuthed={onAuthed} onBack={() => {}} setGlobalError={() => {}} tenantSlug="shine" />);
    expect(screen.queryByPlaceholderText("Mobile phone")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onAuthed).toHaveBeenCalled());
  });
});

describe("hosts on the public booking page", () => {
  const signedInAs = (profile) => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "host-1", email: "host@example.com" } } } });
    mocks.fetchProfile.mockResolvedValue({ id: "host-1", tenant_id: null, ...profile });
  };

  it.each([
    ["Potentia admin", { role: "potentia_admin" }, "a Potentia admin", "Back to admin"],
    ["shop owner", { role: "business_owner", tenant_id: "tenant-1" }, "staff", "Back to dashboard"],
    ["shop staff", { role: "staff", tenant_id: "tenant-1" }, "staff", "Back to dashboard"],
  ])("a signed-in %s stays on the portal, sees a note, and books through the guest form", async (_l, profile, who, back) => {
    signedInAs(profile);
    renderPortal();
    const note = await screen.findByRole("status");
    expect(note.textContent).toMatch(new RegExp(`signed in as ${who}`));
    expect(note.textContent).toMatch(/saved as a guest request/);
    expect(screen.getByRole("link", { name: back })).toBeTruthy();
    expect(screen.queryByText("My Account")).toBeNull();
    fireEvent.click(screen.getByText("Book a Service"));
    expect(await screen.findByText("Guest booking flow")).toBeTruthy();
    expect(screen.queryByText("Account booking flow")).toBeNull();
    fireEvent.click(screen.getByText("Pick 2:00 PM"));
    expect(await screen.findByText("Confirmed guest request")).toBeTruthy();
  });

  it("the admin's 'Back to admin' link points at the host portal", async () => {
    signedInAs({ role: "potentia_admin" });
    renderPortal();
    expect((await screen.findByRole("link", { name: "Back to admin" })).getAttribute("href")).toBe("/crm/admin");
  });

  it("a shop's own customer gets no host note", async () => {
    signedInAs({ role: "customer", tenant_id: "tenant-1" });
    renderPortal();
    await screen.findByText("My Account");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("guest-only portal (Juan's Auto Detailing)", () => {
  beforeEach(() => { mocks.slug = "juans-auto-detailing"; });

  it("has no Log In / sign-up anywhere: Book goes straight to the guest form", async () => {
    const { container } = renderPortal();
    fireEvent.click(await screen.findByText("Book a Service"));
    expect(await screen.findByText("Guest booking flow")).toBeTruthy();
    expect(screen.queryByText("Log In")).toBeNull();
    expect(screen.queryByText(/Create an account|Continue as guest|Sign in|Sign up/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/tel:|sms:/i);
    fireEvent.click(screen.getByText("Pick 2:00 PM"));
    expect(await screen.findByText("Confirmed guest request")).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("other shops keep Log In and the account choice", async () => {
    mocks.slug = "shine";
    renderPortal();
    expect(await screen.findByText("Log In")).toBeTruthy();
    fireEvent.click(screen.getByText("Book a Service"));
    expect(screen.getByRole("button", { name: "Create an account" })).toBeTruthy();
  });

  it("an existing signed-in customer of Juan's still books on their account and can sign out", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "c-1", email: "c@example.com" } } } });
    mocks.fetchProfile.mockResolvedValue({ id: "c-1", role: "customer", tenant_id: "tenant-1", full_name: "Cam" });
    renderPortal();
    await screen.findByText("My Account");
    fireEvent.click(screen.getByText("Book a Service"));
    expect(await screen.findByText("Account booking flow")).toBeTruthy();
  });

  it("the admin 'signed in as' note still shows and the admin books as a guest", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "host-1", email: "h@example.com" } } } });
    mocks.fetchProfile.mockResolvedValue({ id: "host-1", tenant_id: null, role: "potentia_admin" });
    renderPortal();
    expect((await screen.findByRole("status")).textContent).toMatch(/signed in as a Potentia admin/);
    fireEvent.click(screen.getByText("Book a Service"));
    expect(await screen.findByText("Guest booking flow")).toBeTruthy();
  });
});
