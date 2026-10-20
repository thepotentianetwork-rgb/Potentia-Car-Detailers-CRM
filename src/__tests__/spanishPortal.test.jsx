import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// --- Mocks: nothing talks to the real Supabase project. ----------------------
const mocks = vi.hoisted(() => ({
  slug: "juans-auto-detailing",
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  fetchServices: vi.fn(),
  fetchAvailability: vi.fn(),
  requestBooking: vi.fn(),
}));
vi.mock("../lib/supabaseClient.js", () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("../api/profiles.js", () => ({ fetchProfile: vi.fn() }));
vi.mock("../api/auth.js", () => ({ signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("../api/services.js", () => ({ fetchServices: mocks.fetchServices }));
vi.mock("../api/bookings.js", () => ({ fetchAvailability: mocks.fetchAvailability, requestBooking: mocks.requestBooking }));
vi.mock("../context/TenantContext.jsx", () => ({
  useTenant: () => ({
    tenant: { id: "tenant-1", slug: mocks.slug, name: mocks.slug === "juans-auto-detailing" ? "Juan's Auto Detailing" : "Shine Shop" },
    config: {
      businessName: mocks.slug === "juans-auto-detailing" ? "Juan's Auto Detailing" : "Shine Shop",
      tagline: "Don't Stress, Enjoy the Best!",
      businessHours: { start: "9:00 AM", end: "5:00 PM" },
      bookingGranularityMin: 30,
      mobileTravelBufferMin: 30,
      timezone: "America/Denver",
    },
  }),
}));

import { AuthProvider } from "../context/AuthContext.jsx";
import { CustomerPortal } from "../pages/CustomerPortal.jsx";
import { BookingFlow } from "../pages/BookingFlow.jsx";
import { Confirmed } from "../pages/Confirmed.jsx";
import { AuthScreen } from "../pages/AuthScreen.jsx";
import { LanguageProvider, initialLang, translateMessage } from "../i18n/index.jsx";
import { formatDay, formatTime, formatDuration } from "../i18n/format.js";

const SERVICES = [
  { id: "s-head", name: "Headlight Restoration", name_es: "Restauración de faros", description: null, description_es: null, price_cents: 4500, duration_min: 30 },
  // migration not applied yet / no Spanish: falls back to English
  { id: "s-odor", name: "Odor Removal", price_cents: 6500, duration_min: 30 },
];
const AFTERNOON = new Date("2026-10-08T19:05:00Z"); // Thu Oct 8, 1:05 PM in Denver

beforeEach(() => {
  mocks.slug = "juans-auto-detailing";
  localStorage.clear();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.fetchServices.mockResolvedValue(SERVICES);
  mocks.fetchAvailability.mockResolvedValue([]);
  mocks.requestBooking.mockResolvedValue({ booking_id: "b-1", status: "pending" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderPortal() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/crm/${mocks.slug}/portal`]}>
        <Routes><Route path="/crm/:tenantSlug/portal" element={<CustomerPortal />} /></Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("language choice", () => {
  it("remembered choice wins; otherwise an es-* browser starts in Spanish; shops without the flag stay English", () => {
    const store = { getItem: (k) => (k === "potentia.lang.juans-auto-detailing" ? "en" : null) };
    expect(initialLang("juans-auto-detailing", true, store, ["es-MX"])).toBe("en");
    expect(initialLang("juans-auto-detailing", true, { getItem: () => null }, ["es-MX", "en"])).toBe("es");
    expect(initialLang("juans-auto-detailing", true, { getItem: () => null }, ["en-US", "es"])).toBe("en");
    expect(initialLang("shine", false, { getItem: () => "es" }, ["es-MX"])).toBe("en");
  });
});

describe("Juan's portal: English/Español toggle", () => {
  it("the header toggle switches the homepage to Spanish (Spanish service names, English fallback) and is remembered", async () => {
    renderPortal();
    expect(await screen.findByRole("button", { name: "Book a Service" })).toBeTruthy();
    const toggle = screen.getByRole("group", { name: /Language/ });
    fireEvent.click(within(toggle).getByRole("button", { name: "ES" }));

    expect(await screen.findByRole("button", { name: "Reservar un servicio" })).toBeTruthy();
    expect(screen.getByText("Restauración de faros")).toBeTruthy();
    expect(screen.getByText("Odor Removal")).toBeTruthy(); // no Spanish name yet -> English
    expect(screen.getByText("Servicios")).toBeTruthy();
    expect(screen.getByText("¡Sin estrés, disfruta lo mejor!")).toBeTruthy();
    expect(screen.getByText("Contacto y horario")).toBeTruthy();
    // tenant-file copy for services without a Spanish description
    expect(screen.getByText(/Elimina olores a cigarro/)).toBeTruthy();
    expect(within(toggle).getByRole("button", { name: "ES" }).getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("potentia.lang.juans-auto-detailing")).toBe("es");
    expect(document.documentElement.lang).toBe("es");

    cleanup();
    renderPortal(); // next visit
    expect(await screen.findByRole("button", { name: "Reservar un servicio" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: /Idioma/ })).getByRole("button", { name: "EN" }));
    expect(await screen.findByRole("button", { name: "Book a Service" })).toBeTruthy();
    expect(localStorage.getItem("potentia.lang.juans-auto-detailing")).toBe("en");
  });

  it("Juan's guest-only portal goes straight to the Spanish booking form (no log-in in either language)", async () => {
    localStorage.setItem("potentia.lang.juans-auto-detailing", "es");
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: "Reservar un servicio" }));
    expect(await screen.findByText("Horarios disponibles")).toBeTruthy();
    expect(screen.queryByText("Iniciar sesión")).toBeNull();
    expect(screen.queryByText("Log In")).toBeNull();
  });

  it("the account screens (for a shop with the toggle and logins) follow the toggle", () => {
    localStorage.setItem("potentia.lang.juans-auto-detailing", "es");
    const setMode = vi.fn();
    const { rerender } = render(<LanguageProvider slug="juans-auto-detailing" enabled>
      <AuthScreen mode="choose" setMode={setMode} onAuthed={vi.fn()} onBack={vi.fn()} onGuest={vi.fn()} setGlobalError={vi.fn()} tenantSlug="x" />
    </LanguageProvider>);
    expect(screen.getByRole("button", { name: "Continuar como invitado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear una cuenta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /¿Ya tienes cuenta\? Inicia sesión/ })).toBeTruthy();
    rerender(<LanguageProvider slug="juans-auto-detailing" enabled>
      <AuthScreen mode="login" setMode={setMode} onAuthed={vi.fn()} onBack={vi.fn()} setGlobalError={vi.fn()} tenantSlug="x" />
    </LanguageProvider>);
    expect(screen.getByPlaceholderText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeTruthy();
  });

  it("other shops get no toggle and stay in English even with a Spanish choice stored", async () => {
    mocks.slug = "shine";
    localStorage.setItem("potentia.lang.shine", "es");
    renderPortal();
    expect(await screen.findByRole("button", { name: "Book a Service" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: /Language|Idioma/ })).toBeNull();
    expect(screen.queryByText("Reservar un servicio")).toBeNull();
  });
});

function renderFlow(lang = "es", props = {}) {
  localStorage.setItem("potentia.lang.juans-auto-detailing", lang);
  const onConfirm = vi.fn();
  render(<LanguageProvider slug="juans-auto-detailing" enabled><BookingFlow guest onConfirm={onConfirm} {...props} /></LanguageProvider>);
  return onConfirm;
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("booking form in Spanish", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(AFTERNOON); });

  it("labels, services, dates and times are Spanish; validation errors are Spanish", async () => {
    renderFlow();
    expect(await screen.findByRole("button", { name: /2:00 p\. m\./ })).toBeTruthy();
    expect(screen.getByText("Reservar un servicio")).toBeTruthy();
    for (const l of ["Nombre", "Teléfono celular", "Correo electrónico (opcional)", "Código postal (opcional)", "Vehículo", "Color (opcional)"]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(screen.getByText("Servicios (elige uno o más)")).toBeTruthy();
    expect(screen.getByText(/Restauración de faros · \$45 · 30 min/)).toBeTruthy();
    expect(screen.getByText("Horarios disponibles")).toBeTruthy();
    expect(screen.getByText("Jue, 8 de oct")).toBeTruthy();
    expect(screen.getByRole("button", { name: /En el taller/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /A domicilio/ }));
    // PR #13's street / city / ZIP fields, in Spanish
    for (const l of ["Calle y número", "Ciudad", "Código postal del servicio"]) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.queryByLabelText("Street address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2:00 p\. m\./ }));
    expect(await screen.findByText("Escribe tu nombre.")).toBeTruthy();
    expect(mocks.requestBooking).not.toHaveBeenCalled();
    type("Nombre", "Ana Ruiz");
    type("Teléfono celular", "435-555-0101");
    type("Vehículo", "2019 Honda CR-V");
    fireEvent.click(screen.getByRole("button", { name: /2:00 p\. m\./ }));
    expect(await screen.findByText("Escribe la calle y el número para el servicio a domicilio.")).toBeTruthy();
    type("Calle y número", "12 Oak St");
    type("Ciudad", "Tremonton");
    fireEvent.click(screen.getByRole("button", { name: /2:00 p\. m\./ }));
    expect(await screen.findByText("Escribe el código postal de 5 dígitos para el servicio a domicilio.")).toBeTruthy();
    expect(mocks.requestBooking).not.toHaveBeenCalled();
  });

  it("server errors shown to the customer are translated; unknown ones get a Spanish lead-in", async () => {
    mocks.requestBooking.mockRejectedValueOnce(new Error("Sorry, that time was just taken. Pick another."));
    renderFlow();
    await screen.findByRole("button", { name: /2:00 p\. m\./ });
    type("Nombre", "Ana Ruiz");
    type("Teléfono celular", "435-555-0101");
    type("Vehículo", "2019 Honda CR-V");
    fireEvent.click(screen.getByRole("button", { name: /2:00 p\. m\./ }));
    expect(await screen.findByText("Lo sentimos, ese horario se acaba de ocupar. Elige otro.")).toBeTruthy();
    expect(translateMessage("That job (240 min) would run past closing. Pick an earlier time.", "es"))
      .toBe("Ese trabajo (240 min) terminaría después del cierre. Elige un horario más temprano.");
    expect(translateMessage("Something odd", "es")).toMatch(/^No pudimos completar tu solicitud/);
    expect(translateMessage("Sorry, that time was just taken. Pick another.", "en")).toBe("Sorry, that time was just taken. Pick another.");
  });

  it("sends the same booking as in English and confirms in Spanish", async () => {
    const onConfirm = renderFlow();
    await screen.findByRole("button", { name: /2:00 p\. m\./ });
    type("Nombre", "Ana Ruiz");
    type("Teléfono celular", "435-555-0101");
    type("Vehículo", "2019 Honda CR-V");
    fireEvent.click(screen.getByRole("button", { name: /2:00 p\. m\./ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mocks.requestBooking.mock.calls[0][0]).toMatchObject({ serviceIds: ["s-head"], startTime: "14:00:00", type: "dropoff", guestName: "Ana Ruiz" });
    const booking = onConfirm.mock.calls[0][0];
    cleanup();
    render(<LanguageProvider slug="juans-auto-detailing" enabled><Confirmed booking={booking} onDone={() => {}} /></LanguageProvider>);
    expect(screen.getByText("¡Gracias, Ana!")).toBeTruthy();
    expect(screen.getByText(/Recibimos tu solicitud de Restauración de faros \(en el taller\) el jue, 8 de oct a las 2:00 p\. m\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Listo" })).toBeTruthy();
  });

  it("English is unchanged when the toggle is on EN", async () => {
    renderFlow("en");
    expect(await screen.findByRole("button", { name: /2:00 PM/ })).toBeTruthy();
    expect(screen.getByText("Book a Service")).toBeTruthy();
    expect(screen.getByText("Thu, Oct 8")).toBeTruthy();
    expect(screen.getByText(/Headlight Restoration · \$45 · 30 min/)).toBeTruthy();
  });
});

describe("Spanish formatting", () => {
  it("times, days and durations", () => {
    expect(formatTime(14 * 60, "es")).toBe("2:00 p. m.");
    expect(formatTime(9 * 60 + 30, "es")).toBe("9:30 a. m.");
    expect(formatTime(14 * 60, "en")).toBe("2:00 PM");
    expect(formatDay(new Date(2026, 9, 20, 12), "es")).toBe("Mar, 20 de oct");
    expect(formatDuration(90, "es")).toBe("1 h 30 min");
    expect(formatDuration(90, "en")).toBe("1 hr 30 min");
  });
});
