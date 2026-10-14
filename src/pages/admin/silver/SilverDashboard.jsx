import { useState } from "react";
import {
  LayoutDashboard, Clock, CalendarDays, Users, BarChart3, FileText, Receipt, Wrench, LogOut, Search, Plus, MoreHorizontal, X,
} from "lucide-react";
import { useTenant } from "../../../context/TenantContext.jsx";
import { useIsDesktop } from "../../../lib/useMediaQuery.js";
import { LoadingBox } from "../../../components/LoadingBox.jsx";
import { ErrorBox } from "../../../components/ErrorBox.jsx";
import { RequestsTab } from "../RequestsTab.jsx";
import { ScheduleTab } from "../ScheduleTab.jsx";
import { InvoicesTab } from "../InvoicesTab.jsx";
import { ExpensesTab } from "../ExpensesTab.jsx";
import { ServicesTab } from "../ServicesTab.jsx";
import { ManualBookingForm } from "../ManualBookingForm.jsx";
import { Overview } from "./Overview.jsx";
import { CustomersView } from "./CustomersView.jsx";
import { AnalyticsView } from "./AnalyticsView.jsx";

// Juan's Auto Detailing owner/staff dashboard (branding ownerTheme "silver").
// Same data and the same feature tabs as the standard dashboard, in a
// sidebar layout on desktop and a bottom nav on phones.
export function SilverDashboard({ session, ownerName, onSignOut, bookings, error, busyId, onAct, onRefresh }) {
  const { tenant, config } = useTenant();
  const desktop = useIsDesktop();
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pending = bookings?.filter((b) => b.status === "pending") || [];

  const nav = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "requests", label: "Requests", icon: Clock, badge: pending.length },
    { key: "schedule", label: "Schedule", icon: CalendarDays },
    { key: "customers", label: "Customers", icon: Users },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "invoices", label: "Invoices", icon: FileText },
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "services", label: "Services", icon: Wrench },
  ];
  const go = (key) => { setTab(key); setMoreOpen(false); };
  const current = nav.find((n) => n.key === tab);

  const search = (
    <label className="flex-1 flex items-center gap-2 bg-[#131315] border border-[#26262A] focus-within:border-[#5A5D63] rounded-lg px-3 py-2 max-w-xl">
      <Search size={15} className="text-[#6E7176] shrink-0" />
      <input
        aria-label="Search customers"
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (e.target.value && tab !== "customers") setTab("customers"); }}
        placeholder="Search customers, phones or vehicles…"
        className="flex-1 bg-transparent outline-none text-[13px] text-[#ECEDEF] placeholder-[#6E7176] min-w-0"
      />
    </label>
  );
  const newButton = (
    <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 bg-gradient-to-b from-[#E6E8EB] to-[#B9BDC3] hover:from-white hover:to-[#CDD1D6] text-[#0A0A0B] text-[13px] font-semibold px-4 py-2 rounded-lg shrink-0">
      <Plus size={15} /> New booking
    </button>
  );

  let body;
  if (!bookings) body = error ? null : <LoadingBox center />;
  else if (tab === "dashboard") body = <Overview bookings={bookings} ownerName={ownerName} onGo={go} />;
  else if (tab === "requests") body = <RequestsTab pending={pending} busyId={busyId} onAct={onAct} allBookings={bookings} onRefresh={onRefresh} />;
  else if (tab === "schedule") body = <ScheduleTab bookings={bookings} busyId={busyId} onAct={onAct} onRefresh={onRefresh} />;
  else if (tab === "customers") body = <CustomersView bookings={bookings} tenantId={tenant.id} query={query} onQuery={setQuery} onRefresh={onRefresh} />;
  else if (tab === "analytics") body = <AnalyticsView bookings={bookings} />;
  else if (tab === "invoices") body = <InvoicesTab bookings={bookings} onRefresh={onRefresh} />;
  else if (tab === "expenses") body = <ExpensesTab userId={session.user.id} />;
  else if (tab === "services") body = <ServicesTab />;

  // The older tabs are styled for the standard dashboard; keep them in a
  // readable column even on wide screens.
  const narrow = ["requests", "schedule", "invoices", "expenses", "services"].includes(tab);

  return (
    <div data-theme="silver" className="flex-1 flex bg-[#0A0A0B] text-[#ECEDEF]" style={{ fontFamily: "Inter, sans-serif" }}>
      {desktop && (
        <aside aria-label="Dashboard navigation" className="w-64 shrink-0 bg-[#0E0E10] border-r border-[#1F1F23] flex flex-col sticky top-0 h-screen">
          <div className="px-6 py-6">
            <div className="text-[15px] font-extrabold tracking-[0.12em] uppercase bg-gradient-to-b from-[#F2F3F5] to-[#9A9EA5] bg-clip-text text-transparent">{config.businessName}</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#6E7176] mt-1">Owner dashboard</div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
            {nav.map(({ key, label, icon: Icon, badge }) => (
              <button key={key} onClick={() => go(key)} aria-current={tab === key ? "page" : undefined}
                className={`w-full flex items-center gap-3 text-[14px] px-3.5 py-2.5 rounded-lg transition-colors ${
                  tab === key ? "bg-gradient-to-r from-[#2C2D31] to-[#1A1A1D] text-white border border-[#3A3B40]" : "text-[#9A9DA2] hover:text-[#E6E8EB] hover:bg-[#151517] border border-transparent"}`}>
                <Icon size={17} /> <span className="flex-1 text-left">{label}</span>
                {badge ? <span className="text-[11px] font-semibold bg-[#C3C7CD] text-[#0A0A0B] rounded-full px-2">{badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className="border-t border-[#1F1F23] p-4">
            {ownerName && <div className="text-[13px] font-medium truncate">{ownerName}</div>}
            <button onClick={onSignOut} className="mt-2 flex items-center gap-2 text-[12px] text-[#8E9196] hover:text-white"><LogOut size={13} /> Sign out</button>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {desktop ? (
          <header className="flex items-center gap-4 px-10 py-5 border-b border-[#1F1F23]">
            {search}
            <div className="flex-1" />
            {newButton}
          </header>
        ) : (
          <header className="px-4 pt-4 pb-3 border-b border-[#1F1F23] space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-extrabold tracking-[0.1em] uppercase bg-gradient-to-b from-[#F2F3F5] to-[#9A9EA5] bg-clip-text text-transparent">{config.businessName}</div>
              <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8E9196] hover:text-white"><LogOut size={13} /> Sign out</button>
            </div>
            {search}
          </header>
        )}

        <main className={`flex-1 w-full mx-auto px-4 py-5 pb-28 lg:px-10 lg:py-8 lg:pb-10 ${narrow ? "max-w-md lg:max-w-3xl" : "max-w-md lg:max-w-7xl"}`}>
          {tab !== "dashboard" && current && <h1 className="text-[20px] lg:text-[24px] font-bold mb-4">{current.label}</h1>}
          {error && <ErrorBox message={error} />}
          {body}
        </main>
      </div>

      {!desktop && (
        <nav aria-label="Dashboard navigation" className="fixed bottom-0 inset-x-0 z-40 bg-[#0E0E10]/95 backdrop-blur border-t border-[#1F1F23] grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {[nav[0], nav[3]].map(({ key, label, icon: Icon }) => (
            <BottomItem key={key} active={tab === key} onClick={() => go(key)} icon={<Icon size={19} />} label={key === "dashboard" ? "Home" : label} />
          ))}
          <div className="flex items-center justify-center">
            <button onClick={() => setAdding(true)} aria-label="New booking" className="-mt-6 w-14 h-14 rounded-full bg-gradient-to-b from-[#E6E8EB] to-[#A9AEB5] text-[#0A0A0B] flex items-center justify-center shadow-lg shadow-black/60 border-4 border-[#0A0A0B]"><Plus size={22} /></button>
          </div>
          <BottomItem active={tab === "schedule"} onClick={() => go("schedule")} icon={<CalendarDays size={19} />} label="Schedule" />
          <BottomItem active={moreOpen || !["dashboard", "customers", "schedule"].includes(tab)} onClick={() => setMoreOpen(true)} icon={<MoreHorizontal size={19} />} label="More" />
        </nav>
      )}

      {!desktop && moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setMoreOpen(false)}>
          <div role="dialog" aria-label="All sections" className="w-full bg-[#131315] border-t border-[#26262A] rounded-t-2xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-semibold">All sections</div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close"><X size={18} className="text-[#8E9196]" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {nav.map(({ key, label, icon: Icon, badge }) => (
                <button key={key} onClick={() => go(key)} className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-[12px] ${tab === key ? "border-[#5A5D63] bg-[#1F1F23]" : "border-[#26262A]"}`}>
                  <Icon size={18} /> {label}{badge ? ` (${badge})` : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {adding && <ManualBookingForm onClose={() => setAdding(false)} onCreated={() => { setAdding(false); onRefresh(); }} />}
    </div>
  );
}

function BottomItem({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${active ? "text-white" : "text-[#7C7F85]"}`}>
      {icon} {label}
    </button>
  );
}
