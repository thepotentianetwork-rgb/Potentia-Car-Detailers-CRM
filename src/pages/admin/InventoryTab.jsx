import { useState, useEffect } from "react";
import { Plus, X, Sparkles, Loader2, Trash2, Car } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { fetchInventory, createVehicle, updateVehicle, deleteVehicle, uploadVehiclePhoto } from "../../api/inventory.js";
import { decodeVin } from "../../lib/vin.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";

const STATUS_LABEL = { for_sale: "For Sale", pending: "Pending", sold: "Sold" };
const STATUS_COLOR = {
  for_sale: "bg-[#173D22] text-[#5FCB7C]",
  pending: "bg-[#3D3315] text-[#D4AF37]",
  sold: "bg-[#232529] text-[#8B8F96]",
};

export function InventoryTab() {
  const { tenant } = useTenant();
  const [vehicles, setVehicles] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    fetchInventory(tenant.id).then(setVehicles).catch((e) => setError(e.message));
  };
  useEffect(load, [tenant.id]);

  const setStatus = async (id, status) => {
    try {
      await updateVehicle(id, { status, sold_at: status === "sold" ? new Date().toISOString() : null });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (v) => {
    try {
      const paths = (v.photos || []).map((url) => url.split(`/vehicle-photos/`)[1]).filter(Boolean);
      await deleteVehicle(v.id, paths);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-2.5 rounded-lg transition-colors"
      >
        <Plus size={14} /> List a Car
      </button>

      {error && <ErrorBox message={error} />}

      {!vehicles ? (
        <LoadingBox center />
      ) : vehicles.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No vehicles listed yet.</div>
      ) : (
        <div className="space-y-2.5">
          {vehicles.map((v) => (
            <div key={v.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
              <div className="flex items-start gap-3">
                {v.photos?.[0] ? (
                  <img src={v.photos[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#0D0E10] flex items-center justify-center shrink-0">
                    <Car size={20} className="text-[#5C5F66]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold truncate">{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Untitled vehicle"}</div>
                    <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded ${STATUS_COLOR[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                  </div>
                  <div className="text-[11px] text-[#8B8F96]">{v.trim}{v.trim && v.mileage ? " · " : ""}{v.mileage ? `${v.mileage.toLocaleString()} mi` : ""}</div>
                  {v.price_cents != null && <div className="text-sm font-bold text-[#D4AF37] mt-1">${(v.price_cents / 100).toLocaleString()}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <select
                  value={v.status}
                  onChange={(e) => setStatus(v.id, e.target.value)}
                  className="flex-1 bg-[#0D0E10] border border-[#232529] rounded-md px-2 py-1.5 text-[11px] outline-none"
                >
                  <option value="for_sale">For Sale</option>
                  <option value="pending">Pending</option>
                  <option value="sold">Sold</option>
                </select>
                <button onClick={() => remove(v)} className="shrink-0 p-1.5 text-[#5C5F66] hover:text-[#E08A8A]">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ListVehicleForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ListVehicleForm({ onClose, onCreated }) {
  const { tenant } = useTenant();
  const [vin, setVin] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [mileage, setMileage] = useState("");
  const [price, setPrice] = useState("");
  const [exteriorColor, setExteriorColor] = useState("");
  const [interiorColor, setInteriorColor] = useState("");
  const [condition, setCondition] = useState("");
  const [features, setFeatures] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const runDecodeVin = async () => {
    if (!vin.trim()) { setError("Enter a VIN first."); return; }
    setDecoding(true);
    setError("");
    try {
      const info = await decodeVin(vin.trim());
      setYear(info.year || "");
      setMake(info.make);
      setModel(info.model);
      setTrim(info.trim);
    } catch (e) {
      setError(e.message);
    } finally {
      setDecoding(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const urls = await Promise.all(files.map((f) => uploadVehiclePhoto(f, tenant.id)));
      setPhotos((p) => [...p, ...urls]);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setUploading(false);
    }
  };

  const runAnalyzePhotos = async () => {
    if (photos.length === 0) { setError("Upload at least one photo first."); return; }
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch("/api/analyze-vehicle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoUrls: photos, vehicle: { year, make, model, trim } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI analysis failed.");
      if (data.exterior_color) setExteriorColor(data.exterior_color);
      if (data.interior_color) setInteriorColor(data.interior_color);
      if (data.condition) setCondition(data.condition);
      if (Array.isArray(data.features)) setFeatures(data.features.join(", "));
      if (data.description) setDescription(data.description);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!make.trim() || !model.trim()) { setError("At least make and model are required."); return; }
    setSaving(true);
    setError("");
    try {
      await createVehicle({
        tenant_id: tenant.id,
        vin: vin.trim() || null,
        year: year ? Number(year) : null,
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim() || null,
        mileage: mileage ? Number(mileage) : null,
        price_cents: price ? Math.round(Number(price) * 100) : null,
        exterior_color: exteriorColor.trim() || null,
        interior_color: interiorColor.trim() || null,
        condition: condition.trim() || null,
        features: features.split(",").map((f) => f.trim()).filter(Boolean),
        description: description.trim() || null,
        photos,
        status: "for_sale",
      });
      onCreated();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="bg-[#0A0A0B] text-[#F5F5F6] w-full max-w-md rounded-xl border border-[#232529] p-5 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[#8B8F96] hover:text-[#F5F5F6]"><X size={18} /></button>
        <h2 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-bold mb-4">List a Car</h2>

        {error && <ErrorBox message={error} />}

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">VIN</label>
        <div className="flex gap-2 mb-5">
          <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17-character VIN"
            className="flex-1 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          <button onClick={runDecodeVin} disabled={decoding} className="shrink-0 flex items-center gap-1.5 text-[12px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white px-3.5 rounded-lg disabled:opacity-60">
            {decoding && <Loader2 size={13} className="animate-spin" />} Decode
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Year</label>
            <input value={year} onChange={(e) => setYear(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Mileage</label>
            <input value={mileage} onChange={(e) => setMileage(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Make</label>
            <input value={make} onChange={(e) => setMake(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Trim</label>
            <input value={trim} onChange={(e) => setTrim(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none" />
          </div>
        </div>

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Price ($)</label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 24999"
          className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5" />

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Photos</label>
        <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading}
          className="w-full text-[12px] text-[#8B8F96] mb-2.5" />
        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {photos.map((url) => (
              <img key={url} src={url} alt="" className="w-14 h-14 rounded-lg object-cover" />
            ))}
          </div>
        )}
        <button
          onClick={runAnalyzePhotos}
          disabled={analyzing || uploading || photos.length === 0}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#0A0A0B] bg-[#D4AF37] hover:bg-[#E4C158] py-2.5 rounded-lg disabled:opacity-50 mb-5"
        >
          {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {analyzing ? "Analyzing…" : "Analyze Photos with AI"}
        </button>

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Exterior Color</label>
        <input value={exteriorColor} onChange={(e) => setExteriorColor(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-3.5" />

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Interior Color</label>
        <input value={interiorColor} onChange={(e) => setInteriorColor(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-3.5" />

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Condition</label>
        <input value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-3.5" />

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Features (comma-separated)</label>
        <input value={features} onChange={(e) => setFeatures(e.target.value)} className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-3.5" />

        <label className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Listing Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 text-sm outline-none mb-5 resize-none" />

        <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white py-2.5 rounded-lg disabled:opacity-60">
          {saving && <Loader2 size={14} className="animate-spin" />} {saving ? "Saving…" : "List This Car"}
        </button>
      </div>
    </div>
  );
}
