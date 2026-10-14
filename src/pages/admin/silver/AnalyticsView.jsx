import { useTenant } from "../../../context/TenantContext.jsx";
import { analytics } from "../../../lib/analytics.js";
import { StatsTab } from "../StatsTab.jsx";
import { Panel, Empty, money, pct } from "./ui.jsx";

const short = (key) => new Date(key + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Bar({ value, max }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return <div className="h-2 bg-[#1F1F23] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#7C8087] to-[#E6E8EB]" style={{ width: `${w}%` }} /></div>;
}

function Figure({ label, value, sub, testid }) {
  return (
    <div className="bg-[#18181B] border border-[#232327] rounded-lg p-3">
      <div className="text-[11px] text-[#8E9196]">{label}</div>
      <div className="text-[20px] font-bold" data-testid={testid}>{value}</div>
      {sub && <div className="text-[11px] text-[#6E7176]">{sub}</div>}
    </div>
  );
}

// Marketing / growth numbers, all from the shop's real bookings.
export function AnalyticsView({ bookings, now = new Date() }) {
  const { config } = useTenant();
  const a = analytics(bookings, now, config.timezone);

  if (a.total === 0) {
    return <Empty>No bookings yet. Analytics fill in as requests come in and jobs are completed.</Empty>;
  }
  const maxTrend = Math.max(0, ...a.trend.map((t) => t.revenueCents));
  const maxSvc = Math.max(0, ...a.services.map((s) => s.count));
  const custTotal = a.repeatCustomers + a.newCustomers;
  const srcTotal = a.sources.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Figure label="Follow-through" testid="follow-through" value={pct(a.followThroughRate)}
          sub={a.followThroughRate == null ? "No jobs due yet" : `${a.completed} completed of ${a.completed + a.cancelled + a.notMarked} due`} />
        <Figure label="Avg price per job" testid="avg-price" value={a.avgPriceCents == null ? "—" : money(a.avgPriceCents)} sub={`${a.completed} completed job${a.completed === 1 ? "" : "s"}`} />
        <Figure label="Revenue (all time)" value={money(a.revenueCents)} sub="Completed jobs" />
        <Figure label="Requests received" value={a.total} sub={`${a.pending} waiting for a reply`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Booked vs completed">
          <ul className="space-y-2 text-[13px]" aria-label="Booked vs completed">
            {[
              ["Booked (accepted)", a.booked],
              ["Completed", a.completed],
              ["Upcoming", a.upcoming],
              ["Past date, not marked done", a.notMarked],
              ["Cancelled", a.cancelled],
              ["Declined", a.declined],
              ["Waiting for reply", a.pending],
            ].map(([l, v]) => (
              <li key={l} className="flex items-center justify-between"><span className="text-[#C3C7CD]">{l}</span><span className="font-semibold">{v}</span></li>
            ))}
          </ul>
        </Panel>

        <Panel title="Revenue by week">
          {maxTrend === 0 ? <Empty>No completed jobs in the last {a.trend.length} weeks.</Empty> : (
            <div className="flex items-end gap-2 h-40" aria-label="Revenue by week">
              {a.trend.map((t) => (
                <div key={t.start} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <div className="text-[10px] text-[#8E9196]">{t.revenueCents ? money(t.revenueCents) : ""}</div>
                  <div className="w-full rounded-t bg-gradient-to-t from-[#5A5D63] to-[#E6E8EB]" style={{ height: `${Math.round((t.revenueCents / maxTrend) * 100)}%`, minHeight: t.revenueCents ? 4 : 1 }} />
                  <div className="text-[10px] text-[#6E7176] whitespace-nowrap">{short(t.start)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Most popular services">
          {a.services.length === 0 ? <Empty>No booked services yet.</Empty> : (
            <ul className="space-y-3" aria-label="Most popular services">
              {a.services.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-[#8E9196]"><span className="text-[#ECEDEF] font-semibold">{s.count}</span> booked · {money(s.revenueCents)}</span>
                  </div>
                  <Bar value={s.count} max={maxSvc} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Repeat vs new customers">
            {custTotal === 0 ? <Empty>No completed jobs yet.</Empty> : (
              <div className="grid grid-cols-2 gap-3">
                <Figure label="Repeat (2+ jobs)" testid="repeat-customers" value={a.repeatCustomers} sub={`${money(a.repeatRevenueCents)} revenue`} />
                <Figure label="One-time" testid="new-customers" value={a.newCustomers} sub={`${money(a.newRevenueCents)} revenue`} />
              </div>
            )}
          </Panel>
          <Panel title="Booking source">
            {srcTotal === 0 ? <Empty>No source recorded on these bookings.</Empty> : (
              <ul className="space-y-3" aria-label="Booking source">
                {a.sources.map((s) => (
                  <li key={s.key}>
                    <div className="flex items-center justify-between text-[13px] mb-1"><span>{s.label}</span><span className="font-semibold">{s.count} · {pct(s.count / srcTotal)}</span></div>
                    <Bar value={s.count} max={srcTotal} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Totals & export"><StatsTab bookings={bookings} /></Panel>
    </div>
  );
}
