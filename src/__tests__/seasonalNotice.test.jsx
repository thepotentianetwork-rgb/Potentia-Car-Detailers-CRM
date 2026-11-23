import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  branding: {
    seasonalNotice: {
      storageKey: "juans-winter-dropoff-notice-v1",
      days: 3,
      kicker: "Winter update",
      title: "Drop-off only this season",
      body: "From now through the cold season, we're doing drop-off service only — no mobile detailing for now. Book your drop-off below!",
      addressPrefix: "Drop-off:",
      cta: "Got it",
      closeLabel: "Close notice",
    },
    contact: { address: "900 W Main St #20, Tremonton, UT 84337" },
    es: {
      seasonalNotice: {
        kicker: "Aviso de invierno",
        title: "Solo drop-off esta temporada",
        body: "Durante la temporada de frío, solo ofrecemos servicio de drop-off — por ahora no hay servicio a domicilio. ¡Reserva tu drop-off abajo!",
        addressPrefix: "Drop-off:",
        cta: "Entendido",
        closeLabel: "Cerrar aviso",
      },
    },
  },
  lang: "en",
}));

vi.mock("../tenants/branding.js", () => ({ useBranding: () => mocks.branding }));
vi.mock("../i18n/index.jsx", () => ({ useLang: () => ({ lang: mocks.lang }) }));

import { SeasonalNotice } from "../components/SeasonalNotice.jsx";

beforeEach(() => {
  mocks.lang = "en";
  localStorage.removeItem("juans-winter-dropoff-notice-v1");
});
afterEach(() => cleanup());

describe("SeasonalNotice (Juan winter drop-off)", () => {
  it("shows the winter drop-off copy and the existing shop address", () => {
    render(<SeasonalNotice />);
    const dialog = screen.getByRole("dialog", { name: "Drop-off only this season" });
    expect(dialog.textContent).toMatch(/Winter update/);
    expect(dialog.textContent).toMatch(/drop-off service only/);
    expect(dialog.textContent).toMatch(/no mobile detailing for now/);
    expect(dialog.textContent).toMatch(/900 W Main St #20, Tremonton, UT 84337/);
  });

  it("remembers dismissal for later visits", () => {
    const { unmount } = render(<SeasonalNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<SeasonalNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses Spanish copy when the portal language is Spanish", () => {
    mocks.lang = "es";
    render(<SeasonalNotice />);
    expect(screen.getByRole("dialog", { name: "Solo drop-off esta temporada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
  });

  it("renders nothing when the tenant has no seasonal notice", () => {
    const saved = mocks.branding;
    mocks.branding = { contact: { address: "1 Main" } };
    render(<SeasonalNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
    mocks.branding = saved;
  });
});
