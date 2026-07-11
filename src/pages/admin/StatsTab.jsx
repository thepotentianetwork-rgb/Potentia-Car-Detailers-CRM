import { DollarSign, CheckCircle2, CalendarDays } from "lucide-react";
import { StatCard } from "../../components/StatCard.jsx";

export function StatsTab({ bookings }) {
  const revenue = bookings.filter((b) => b.status === "completed").reduce((sum, b) => sum + (b.price_cents || 0), 0) / 100;
  const jobsCompleted = bookings.filter((b) => b.status === "completed").length;
  const jobsBooked = bookings.filter((b) => b.status === "approved").length;

  return (
    <div className="grid grid-cols-3 gap-2.5">
      <StatCard icon={<DollarSign size={14} />} label="Revenue" value={`$${revenue.toFixed(0)}`} accent />
      <StatCard icon={<CheckCircle2 size={14} />} label="Completed" value={jobsCompleted} />
      <StatCard icon={<CalendarDays size={14} />} label="Upcoming" value={jobsBooked} />
    </div>
  );
}
