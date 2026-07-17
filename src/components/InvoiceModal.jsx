import { X, Printer } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";
import { dayLabel, minutesToDisplay, pgTimeToMinutes } from "../lib/time.js";

export function InvoiceModal({ booking, onClose }) {
  const { config } = useTenant();
  const amount = (booking.price_cents || 0) / 100;
  const invoiceNumber = booking.id.slice(0, 8).toUpperCase();
  const serviceDate = dayLabel(new Date(booking.booking_date + "T00:00:00"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 print:bg-white print:p-0" onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .invoice-printable, .invoice-printable * { visibility: visible; }
          .invoice-printable { position: absolute; inset: 0; width: 100%; box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <div
        className="invoice-printable bg-white text-[#1A1A1A] w-full max-w-md rounded-xl shadow-2xl p-8 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[#9CA3AF] hover:text-[#1A1A1A] print:hidden">
          <X size={18} />
        </button>

        <div className="mb-6">
          <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-extrabold uppercase tracking-wide">
            {config.businessName}
          </div>
          <div className="text-[12px] text-[#6B7280]">{config.tagline}</div>
        </div>

        <div className="flex items-start justify-between mb-6 pb-6 border-b border-[#E5E7EB]">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF] mb-1">Billed to</div>
            <div className="text-sm font-semibold">{booking.profiles?.full_name || "Customer"}</div>
            {booking.profiles?.phone && <div className="text-[12px] text-[#6B7280]">{booking.profiles.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-[#9CA3AF] mb-1">Invoice</div>
            <div className="text-sm font-semibold">#{invoiceNumber}</div>
            <div className="text-[12px] text-[#6B7280] mb-1.5">{serviceDate}</div>
            <span
              className={`inline-block text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                booking.paid ? "bg-[#E3F5E8] text-[#1F7A3D]" : "bg-[#FDECEA] text-[#C0392B]"
              }`}
            >
              {booking.paid ? `Paid · ${booking.payment_method || ""}` : "Unpaid"}
            </span>
          </div>
        </div>

        <table className="w-full mb-6">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#9CA3AF] text-left">
              <th className="pb-2 font-medium">Service</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#E5E7EB]">
              <td className="py-3">
                <div className="text-sm font-medium">{booking.services?.name || "Service"}</div>
                <div className="text-[11px] text-[#6B7280] flex items-center gap-1">
                  {booking.type === "mobile" ? "Mobile" : "Drop-off"} · {minutesToDisplay(pgTimeToMinutes(booking.start_time))} · {booking.duration_min} min
                </div>
                {booking.type === "mobile" && booking.mobile_address && (
                  <div className="text-[11px] text-[#6B7280] mt-0.5">{booking.mobile_address}</div>
                )}
              </td>
              <td className="py-3 text-right text-sm font-medium">${amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between pt-4 border-t border-[#E5E7EB] mb-8">
          <div className="text-sm font-bold">{booking.paid ? "Total Paid" : "Total Due"}</div>
          <div className="text-lg font-bold">${amount.toFixed(2)}</div>
        </div>

        <div className="text-center text-[11px] text-[#9CA3AF] mb-6">Thank you for choosing {config.businessName}!</div>

        <button
          onClick={() => window.print()}
          className="w-full flex items-center justify-center gap-1.5 bg-[#0A0A0B] hover:bg-black text-white font-semibold text-sm py-2.5 rounded-lg print:hidden"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
