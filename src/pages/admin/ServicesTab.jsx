import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Pencil, Plus } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import {
  fetchAllServices, createService, updateService,
} from "../../api/services.js";
import { dollars, minutesText } from "../../lib/addons.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

const inputCls = "w-full bg-[#111214] border border-[#232529] rounded-md px-2.5 py-1.5 text-[12px] outline-none";

// Service editor. (Add-ons were retired in favor of booking several
// services at once; their old rows stay in the database for history.)
const KINDS = {
  service: {
    title: "Services",
    minutesKey: "duration_min",
    minutesLabel: "Duration (min)",
    minMinutes: 15,
    maxMinutes: 720,
    maxDesc: 1000,
    descHint: "One line per item; shown on your homepage.",
    fetch: (tid) => fetchAllServices(tid),
    create: createService,
    update: updateService,
    summary: (x) => `${dollars(x.price_cents)} · ${minutesText(x.duration_min)}`,
  },
};

// Returns [fields, error]. Prices are typed in dollars, stored in cents.
export function parseCatalogForm(kind, form) {
  const k = KINDS[kind];
  const name = form.name.trim();
  if (name.length < 2 || name.length > 100) return [null, "Name must be 2-100 characters."];
  const price = Number(String(form.price).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(price) || price < 0 || String(form.price).trim() === "") return [null, "Enter a price of $0 or more."];
  const minutes = Number(form.minutes);
  if (!Number.isInteger(minutes) || minutes < k.minMinutes || minutes > k.maxMinutes) {
    return [null, `${k.minutesLabel.replace(" (min)", "")} must be ${k.minMinutes}-${k.maxMinutes} minutes.`];
  }
  const description = form.description.trim();
  if (description.length > k.maxDesc) return [null, `Description must be ${k.maxDesc} characters or fewer.`];
  return [{ name, description: description || null, price_cents: Math.round(price * 100), [k.minutesKey]: minutes }, ""];
}

const toForm = (kind, x) => ({
  name: x?.name || "",
  description: x?.description || "",
  price: x ? String(x.price_cents / 100) : "",
  minutes: x ? String(x[KINDS[kind].minutesKey] ?? 0) : kind === "service" ? "60" : "0",
});

function CatalogForm({ kind, initial, onSave, onCancel, saveLabel }) {
  const k = KINDS[kind];
  const [form, setForm] = useState(toForm(kind, initial));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const id = `${kind}-${initial?.id || "new"}`;

  const submit = async (e) => {
    e.preventDefault();
    const [fields, problem] = parseCatalogForm(kind, form);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(fields);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[#0D0E10] border border-[#232529] rounded-lg p-2.5 space-y-2">
      <label htmlFor={`${id}-name`} className="sr-only">Name</label>
      <input id={`${id}-name`} aria-label="Name" value={form.name} onChange={set("name")} placeholder="Name" className={inputCls} />
      <textarea aria-label="Description" value={form.description} onChange={set("description")} rows={3}
        placeholder={k.descHint} className={inputCls} />
      <div className="flex gap-2">
        <input aria-label="Price ($)" inputMode="decimal" value={form.price} onChange={set("price")} placeholder="Price ($)" className={inputCls} />
        <input aria-label={k.minutesLabel} inputMode="numeric" value={form.minutes} onChange={set("minutes")} placeholder={k.minutesLabel} className={inputCls} />
      </div>
      {error && <div role="alert" className="text-[11px] text-[#E08A8A]">{error}</div>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className="flex-1 text-[11px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-1.5 rounded disabled:opacity-60">
          {saving ? "Saving…" : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 text-[11px] text-[#8B8F96] border border-[#232529] py-1.5 rounded">Cancel</button>
      </div>
    </form>
  );
}

function CatalogSection({ kind, tenantId }) {
  const k = KINDS[kind];
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => k.fetch(tenantId).then((r) => setItems(r || [])).catch((e) => { setError(e.message); setItems([]); });
  useEffect(() => { load(); }, [tenantId]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // Move item i by delta, then renumber sort_order 1..n for rows that changed.
  const move = (i, delta) => run(async () => {
    const order = [...items];
    const [x] = order.splice(i, 1);
    order.splice(i + delta, 0, x);
    for (const [idx, item] of order.entries()) {
      if (item.sort_order !== idx + 1) await k.update(item.id, { sort_order: idx + 1 });
    }
  });

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[12px] font-bold uppercase tracking-wide text-[#8B8F96]">{k.title}</h2>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} className="flex items-center gap-1 text-[11px] font-semibold text-[#C9CDD3] border border-[#232529] hover:border-[#4A4D53] px-2 py-1 rounded">
            <Plus size={11} /> Add {kind === "service" ? "service" : "add-on"}
          </button>
        )}
      </div>
      {error && <ErrorBox message={error} />}
      {adding && (
        <div className="mb-2">
          <CatalogForm kind={kind} saveLabel={`Add ${kind === "service" ? "service" : "add-on"}`} onCancel={() => setAdding(false)}
            onSave={async (fields) => {
              const nextOrder = (items || []).reduce((m, x) => Math.max(m, x.sort_order || 0), 0) + 1;
              await k.create(tenantId, { ...fields, sort_order: nextOrder, active: true });
              setAdding(false);
              await load();
            }} />
        </div>
      )}
      {!items ? <LoadingBox /> : items.length === 0 && !adding ? (
        <div className="text-center py-6 text-[12px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">
          {kind === "service" ? "No services yet." : "No add-ons yet. Add extras like Pet Hair Removal that customers can stack on any service."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((x, i) =>
            editingId === x.id ? (
              <CatalogForm key={x.id} kind={kind} initial={x} saveLabel="Save" onCancel={() => setEditingId(null)}
                onSave={async (fields) => { await k.update(x.id, fields); setEditingId(null); await load(); }} />
            ) : (
              <div key={x.id} data-testid={`${kind}-row`} className={`bg-[#111214] border border-[#232529] rounded-lg p-2.5 ${x.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{x.name}{!x.active && <span className="text-[10px] text-[#8B8F96]"> · inactive</span>}</div>
                    <div className="text-[11px] text-[#8B8F96]">{k.summary(x)}</div>
                    {x.description && <div className="text-[11px] text-[#5C5F66] whitespace-pre-line mt-0.5">{x.description}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button aria-label={`Move ${x.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)} className="p-1 text-[#5C5F66] hover:text-[#C9CDD3] disabled:opacity-30"><ArrowUp size={12} /></button>
                    <button aria-label={`Move ${x.name} down`} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-[#5C5F66] hover:text-[#C9CDD3] disabled:opacity-30"><ArrowDown size={12} /></button>
                    <button aria-label={`Edit ${x.name}`} onClick={() => { setEditingId(x.id); setAdding(false); }} className="p-1 text-[#5C5F66] hover:text-[#C9CDD3]"><Pencil size={12} /></button>
                    <label className="flex items-center gap-1 text-[10px] text-[#8B8F96] ml-1">
                      <input type="checkbox" aria-label={`${x.name} active`} checked={!!x.active} disabled={busy}
                        onChange={(e) => run(() => k.update(x.id, { active: e.target.checked }))} />
                      Active
                    </label>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

// Owner dashboard: manage what customers can book. Nothing is deleted (past
// bookings point at services and keep a snapshot of what was booked); turn off
// "Active" to hide one from new bookings.
export function ServicesTab() {
  const { tenant } = useTenant();
  return (
    <div>
      <p className="text-[12px] text-[#8B8F96] mb-4">Changes apply to new bookings. Existing bookings keep the price and time they were booked with. Untick Active to stop offering something.</p>
      <CatalogSection kind="service" tenantId={tenant.id} />
    </div>
  );
}
