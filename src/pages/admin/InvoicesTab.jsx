import { useState, useMemo } from "react";
import { Search, Receipt, Home, Building2 } from "lucide-react";
import { dayLabel } from "../../lib/time.js";
import { InvoiceModal } from "../../components/InvoiceModal.jsx";

export function InvoicesTab({ bookings }) {
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

      {completed.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-[#5C5F66] border border-dashed border-[#232529] rounded-lg">
          {query ? "No matching invoices." : "No completed jobs yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {completed.map((b) => (
            <div key={b.id} className="bg-[#111214] border border-[#232529] rounded-lg p-3.5 flex items-center justify-between gap-2">
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
          ))}
        </div>
      )}

      {invoiceBooking && <InvoiceModal booking={invoiceBooking} onClose={() => setInvoiceBooking(null)} />}
    </div>
  );
}
