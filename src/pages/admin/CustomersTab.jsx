import { useState, useEffect, useMemo } from "react";
import { Phone, Car, DollarSign, CalendarCheck } from "lucide-react";
import { fetchAllVehicles, updateVehicleNotes } from "../../api/vehicles.js";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";
import { dayLabel } from "../../lib/time.js";

export function CustomersTab({ bookings }) {
  const [vehicles, setVehicles] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAllVehicles().then(setVehicles).catch((e) => setError(e.message));
  }, []);

  const customers = useMemo(() => {
    const byProfile = new Map();
    for (const b of bookings) {
      const id = b.profile_id;
      if (!byProfile.has(id)) {
        byProfile.set(id, {
          profileId: id,
          name: b.profiles?.full_name || "Customer",
          phone: b.profiles?.phone,
          visits: 0,
          lifetimeSpend: 0,
          lastVisitDate: null,
        });
      }
      const c = byProfile.get(id);
      if (b.status === "completed") {
        c.visits += 1;
        c.lifetimeSpend += b.price_cents || 0;
        if (!c.lastVisitDate || b.booking_date > c.lastVisitDate) c.lastVisitDate = b.booking_date;
      }
    }
    return [...byProfile.values()].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
  }, [bookings]);

  if (error) return <ErrorBox message={error} />;
  if (!vehicles) return <LoadingBox center />;

  if (customers.length === 0) {
    return <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">No customers yet.</div>;
  }

  return (
    <div className="space-y-3">
      {customers.map((c) => (
        <CustomerCard key={c.profileId} customer={c} vehicles={vehicles.filter((v) => v.profile_id === c.profileId)} />
      ))}
    </div>
  );
}

function CustomerCard({ customer, vehicles }) {
  return (
    <div className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-semibold">{customer.name}</div>
          {customer.phone && (
            <div className="text-[11px] text-[#8B8F96] flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {customer.phone}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-[#D4AF37]">${(customer.lifetimeSpend / 100).toFixed(0)}</div>
          <div className="text-[10px] text-[#5C5F66] uppercase tracking-wide">lifetime</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-[#8B8F96] mb-3">
        <span className="flex items-center gap-1"><DollarSign size={11} /> {customer.visits} visit{customer.visits === 1 ? "" : "s"}</span>
        {customer.lastVisitDate && (
          <span className="flex items-center gap-1">
            <CalendarCheck size={11} /> Last: {dayLabel(new Date(customer.lastVisitDate + "T00:00:00"))}
          </span>
        )}
      </div>

      {vehicles.length > 0 && (
        <div className="space-y-2 border-t border-[#232529] pt-3">
          {vehicles.map((v) => (
            <VehicleNotes key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleNotes({ vehicle }) {
  const [notes, setNotes] = useState(vehicle.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = notes !== (vehicle.notes || "");

  const save = async () => {
    setSaving(true);
    try {
      await updateVehicleNotes(vehicle.id, notes || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setNotes(vehicle.notes || "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="text-[12px] text-[#C9CDD3] flex items-center gap-1.5 mb-1">
        <Car size={11} /> {vehicle.label}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paint condition, gate code, allergies, upsell notes…"
        rows={2}
        className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3 py-2 text-[12px] outline-none resize-none placeholder-[#5C5F66]"
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="mt-1.5 text-[11px] font-semibold text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white px-2.5 py-1 rounded-md disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      )}
      {saved && <span className="ml-2 text-[11px] text-[#5FCB7C]">Saved</span>}
    </div>
  );
}
