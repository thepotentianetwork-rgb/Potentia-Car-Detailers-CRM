import { DollarSign, CheckCircle2, CalendarDays, Download } from "lucide-react";
import { StatCard } from "../../components/StatCard.jsx";
import { toCSV, downloadCSV } from "../../lib/csv.js";
import { iso } from "../../lib/time.js";

export function StatsTab({ bookings }) {
  const completed = bookings.filter((b) => b.status === "completed");
  const revenue = completed.reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100;
  const jobsCompleted = completed.length;
  const jobsBooked = bookings.filter((b) => b.status === "approved").length;

  const exportIncome = () => {
    const sorted = [...completed].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    const csv = toCSV(sorted, [
      { label: "Date", value: (b) => b.booking_date },
      { label: "Customer", value: (b) => b.profiles?.full_name || "" },
      { label: "Service", value: (b) => b.services?.name || "" },
      { label: "Type", value: (b) => b.type },
      { label: "Amount", value: (b) => ((b.price_cents || 0) / 100).toFixed(2) },
    ]);
    downloadCSV(`income-${iso(new Date())}.csv`, csv);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <StatCard icon={<DollarSign size={14} />} label="Revenue" value={`$${revenue.toFixed(0)}`} accent />
        <StatCard icon={<CheckCircle2 size={14} />} label="Completed" value={jobsCompleted} />
        <StatCard icon={<CalendarDays size={14} />} label="Upcoming" value={jobsBooked} />
      </div>
      <button
        onClick={exportIncome}
        disabled={completed.length === 0}
        className="w-full flex items-center justify-center gap-1.5 border border-[#232529] hover:border-[#4A4D53] text-[#C9CDD3] text-[12px] font-medium py-2.5 rounded-lg transition-colors disabled:opacity-40"
      >
        <Download size={13} /> Export income (CSV)
      </button>
    </div>
  );
}
