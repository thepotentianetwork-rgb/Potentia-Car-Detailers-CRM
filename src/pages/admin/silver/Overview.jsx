import { Users, CalendarDays, DollarSign, CheckCircle2, CalendarPlus, CircleCheck, Wallet } from "lucide-react";
import { useTenant } from "../../../context/TenantContext.jsx";
import { BookingLinkCard } from "../../../components/BookingLinkCard.jsx";
import { dashboardStats, todaysSchedule, pipelineCounts, recentActivity } from "../../../lib/analytics.js";
import { bookingTitle } from "../../../lib/bookingServices.js";
import { minutesToDisplay, pgTimeToMinutes } from "../../../lib/time.js";
import { Panel, Stat, StatusPill, Empty, money, timeAgo } from "./ui.jsx";

const PIPE_DOT = { pending: "bg-[#E8C46A]", approved: "bg-[#9DBDEB]", completed: "bg-[#7FD49A]", declined: "bg-[#E59595]", cancelled: "bg-[#8E9196]" };
const ACT_ICON = { new: CalendarPlus, completed: CircleCheck, paid: Wallet };

function greeting(timeZone, now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Overview({ bookings, ownerName, onGo, now = new Date() }) {
  const { tenant, config } = useTenant();
  const tz = config.timezone;
  const stats = dashboardStats(bookings, now, tz);
  const today = todaysSchedule(bookings, now, tz);
  const pipeline = pipelineCounts(bookings);
  const activity = recentActivity(bookings);
  const first = (ownerName || "").trim().split(/\s+/)[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] lg:text-[30px] font-bold">{greeting(tz, now)}{first ? `, ${first}` : ""}</h1>
        <p className="text-[13px] text-[#8E9196]">Here's what's happening at {config.businessName}.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="stat-cards">
        <Stat icon={<Users size={18} />} label="New leads" value={stats.newLeadsWeek} sub="This week" />
        <Stat icon={<CalendarDays size={18} />} label="Appointments" value={stats.appointmentsToday} sub="Today" />
        <Stat icon={<DollarSign size={18} />} label="Revenue" value={money(stats.revenueWeekCents)} sub="This week · completed" />
        <Stat icon={<CheckCircle2 size={18} />} label="Completed jobs" value={stats.completedWeek} sub="This week" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Today's Schedule" className="lg:col-span-1"
          action={<button onClick={() => onGo("schedule")} className="text-[12px] text-[#C3C7CD] hover:text-white">View schedule</button>}>
          {today.length === 0 ? <Empty>Nothing booked for today.</Empty> : (
            <ul className="space-y-2" aria-label="Today's schedule">
              {today.map((b) => (
                <li key={b.id} className="flex items-center gap-3 bg-[#18181B] border border-[#232327] rounded-lg px-3 py-2.5">
                  <div className="w-16 shrink-0 text-[12px] font-semibold text-[#C3C7CD]">{minutesToDisplay(pgTimeToMinutes(b.start_time))}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{b.profiles?.full_name || "Customer"}</div>
                    <div className="text-[11px] text-[#8E9196] truncate">{bookingTitle(b)}{b.vehicles?.label ? ` · ${b.vehicles.label}` : ""}</div>
                    {b.type === "mobile" && b.mobile_address && <div className="text-[11px] text-[#8E9196] truncate">Mobile · {b.mobile_address}</div>}
                  </div>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Lead Pipeline" action={<button onClick={() => onGo("requests")} className="text-[12px] text-[#C3C7CD] hover:text-white">View requests</button>}>
          {bookings.length === 0 ? <Empty>No bookings yet.</Empty> : (
            <ul className="divide-y divide-[#232327]" aria-label="Lead pipeline">
              {pipeline.map((s) => (
                <li key={s.status} className="flex items-center justify-between py-2.5 text-[13px]">
                  <span className="flex items-center gap-2.5"><span className={`w-2.5 h-2.5 rounded-sm ${PIPE_DOT[s.status]}`} /> {s.label}</span>
                  <span data-stage={s.status} className="font-semibold">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Activity">
          {activity.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ul className="space-y-3" aria-label="Recent activity">
              {activity.map((e) => {
                const Icon = ACT_ICON[e.type];
                return (
                  <li key={e.key} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1F1F23] border border-[#2C2D31] flex items-center justify-center text-[#C3C7CD] shrink-0"><Icon size={14} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{e.title}</div>
                      <div className="text-[11px] text-[#8E9196] truncate">{e.detail}</div>
                    </div>
                    <div className="text-[11px] text-[#6E7176] shrink-0">{timeAgo(e.at, now)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <BookingLinkCard slug={tenant.slug} businessName={config.businessName} />
    </div>
  );
}
