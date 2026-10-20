import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ slug: "juans-auto-detailing", fetchAllServices: vi.fn(), createService: vi.fn(), updateService: vi.fn() }));
vi.mock("../lib/supabaseClient.js", () => ({ supabase: {} }));
vi.mock("../api/services.js", () => ({
  fetchAllServices: mocks.fetchAllServices, createService: mocks.createService, updateService: mocks.updateService,
}));
vi.mock("../context/TenantContext.jsx", () => ({ useTenant: () => ({ tenant: { id: "tenant-1", slug: mocks.slug }, config: {} }) }));

import { ServicesTab } from "../pages/admin/ServicesTab.jsx";

const HEAD = { id: "svc-h", name: "Headlight Restoration", name_es: "Restauración de faros", description: null, description_es: null,
  price_cents: 4500, duration_min: 30, active: true, sort_order: 1 };

beforeEach(() => {
  mocks.slug = "juans-auto-detailing";
  mocks.updateService.mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Services tab: Spanish name for the customer language toggle", () => {
  it("Juan (migration applied) sees and edits the Spanish name/description; blank clears it", async () => {
    mocks.fetchAllServices.mockResolvedValue([HEAD]);
    render(<ServicesTab />);
    expect(await screen.findByText("ES: Restauración de faros")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Edit Headlight Restoration"));
    expect(screen.getByLabelText("Spanish name (optional)").value).toBe("Restauración de faros");
    fireEvent.change(screen.getByLabelText("Spanish name (optional)"), { target: { value: "  Faros como nuevos " } });
    fireEvent.change(screen.getByLabelText("Spanish description (optional)"), { target: { value: "Faros claros" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledWith("svc-h", expect.objectContaining({
      name: "Headlight Restoration", name_es: "Faros como nuevos", description_es: "Faros claros" })));

    mocks.updateService.mockClear();
    fireEvent.click(screen.getByLabelText("Edit Headlight Restoration"));
    fireEvent.change(screen.getByLabelText("Spanish name (optional)"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.updateService).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Spanish name (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalledWith("svc-h", expect.objectContaining({ name_es: null })));
  });

  it("before the migration (no name_es column) the fields are hidden and saves don't send them", async () => {
    const { name_es, description_es, ...old } = HEAD;
    mocks.fetchAllServices.mockResolvedValue([old]);
    render(<ServicesTab />);
    await screen.findByText("Headlight Restoration");
    fireEvent.click(screen.getByLabelText("Edit Headlight Restoration"));
    expect(screen.queryByLabelText("Spanish name (optional)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateService).toHaveBeenCalled());
    expect(mocks.updateService.mock.calls[0][1]).not.toHaveProperty("name_es");
  });

  it("other shops never see Spanish fields", async () => {
    mocks.slug = "shine";
    mocks.fetchAllServices.mockResolvedValue([HEAD]);
    render(<ServicesTab />);
    await screen.findByText("Headlight Restoration");
    fireEvent.click(screen.getByLabelText("Edit Headlight Restoration"));
    expect(screen.queryByLabelText("Spanish name (optional)")).toBeNull();
    expect(screen.queryByText(/^ES:/)).toBeNull();
  });
});
