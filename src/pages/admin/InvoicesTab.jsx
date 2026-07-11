import { useState, useMemo } from "react";
import { Search, Receipt, Home, Building2, Check } from "lucide-react";
import { CONFIG } from "../../config.js";
import { dayLabel } from "../../lib/time.js";
import { updateBookingPayment } from "../../api/bookings.js";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";

export function InvoicesTab({ bookings, onRefresh }) {
  const [query, setQuery] = useState("");
  const [invoiceBooking, setInvoiceBooking] = useState(null);

  const completed = useMemo(() => {
    return bookings
      .filter((b) => b.status === "completed")
      .filter((b) => {
        if (!query.trim()) return true;
        const name = (b.profiles?.full_name || "").toLowerCase();
        const service = (b.services?.name || "").toLowerCase();
        return name.includes(query.toLowerCase()) || service.includes(query.toLowerCase());
      })
      .sort((a, b) => (b.booking_date + b.start_time).localeCompare(a.booking_date + a.start_time));
  }, [bookings, query]);

  const outstanding = completed.filter((b) => !b.paid);
  const outstandingTotal = outstanding.reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100;

  return (
    <div>
      <div className="flex items-center gap-2.5 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 mb-4">
        <Search size={14} className="text-[#5C5F66]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by customer or service…"
          className="bg-transparent outline-none text-sm text-[#F5F5F6] placeholder-[#5C5F66] w-full"
        />
      </div>

      {outstanding.length > 0 && (
        <div className="flex items-center justify-between bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 mb-4 text-[12px]">
          <span className="text-[#E08A8A]">Outstanding ({outstanding.length})</span>
          <span className="font-semibold text-[#E08A8A]">${outstandingTotal.toFixed(0)}</span>
        </div>
      )}

      {completed.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">
          {query ? "No matching invoices." : "No completed jobs yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {completed.map((b) => (
            <div key={b.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{b.profiles?.full_name || "Customer"}</div>
                  <div className="text-[11px] text-[#8B8F96] flex items-center gap-1.5 mt-0.5">
                    {b.type === "mobile" ? <Home size={10} /> : <Building2 size={10} />}
                    <span className="truncate">{b.services?.name}</span>
                    <span className="shrink-0">· {dayLabel(new Date(b.booking_date + "T00:00:00"))}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-[#C9CDD3]">${((b.price_cents || 0) / 100).toFixed(0)}</span>
                  <button
                    onClick={() => setInvoiceBooking(b)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1.5 rounded"
                  >
                    <Receipt size={10} /> Invoice
                  </button>
                </div>
              </div>
              <PaymentControl booking={b} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      )}

      {invoiceBooking && <InvoiceModal booking={invoiceBooking} onClose={() => setInvoiceBooking(null)} />}
    </div>
  );
}

function PaymentControl({ booking, onRefresh }) {
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const markPaid = async (method) => {
    setSaving(true);
    try {
      await updateBookingPayment(booking.id, { paid: true, paymentMethod: method });
      onRefresh();
    } finally {
      setSaving(false);
      setPicking(false);
    }
  };

  const markUnpaid = async () => {
    setSaving(true);
    try {
      await updateBookingPayment(booking.id, { paid: false, paymentMethod: null });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  if (booking.paid) {
    return (
      <div className="flex items-center justify-between border-t border-[#232529] pt-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-[#5FCB7C]">
          <Check size={11} /> Paid via {booking.payment_method || "unknown"}
        </span>
        <button onClick={markUnpaid} disabled={saving} className="text-[10px] text-[#5C5F66] hover:text-[#E08A8A] disabled:opacity-50">
          Undo
        </button>
      </div>
    );
  }

  if (picking) {
    return (
      <div className="flex flex-wrap gap-1.5 border-t border-[#232529] pt-2.5">
        {CONFIG.paymentMethods.map((m) => (
          <button
            key={m}
            onClick={() => markPaid(m)}
            disabled={saving}
            className="text-[10px] font-medium text-[#0A0A0B] bg-[#E4E7EB] hover:bg-white px-2 py-1 rounded disabled:opacity-50"
          >
            {m}
          </button>
        ))}
        <button onClick={() => setPicking(false)} className="text-[10px] text-[#5C5F66] px-2 py-1">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t border-[#232529] pt-2.5">
      <span className="text-[11px] text-[#E08A8A]">Unpaid</span>
      <button onClick={() => setPicking(true)} className="text-[10px] font-semibold text-[#C9CDD3] hover:text-white border border-[#232529] hover:border-[#4A4D53] px-2 py-1 rounded">
        Mark Paid
      </button>
    </div>
  );
}
