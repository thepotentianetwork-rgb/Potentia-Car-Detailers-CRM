import { useState, useEffect } from "react";
import { LogOut, Clock, CalendarDays, DollarSign, Receipt, Users } from "lucide-react";
import { CONFIG } from "../../config.js";
import { fetchAllBookings, updateBookingStatus } from "../../api/bookings.js";
import { TabButton } from "../../components/TabButton.jsx";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";
import { RequestsTab } from "./RequestsTab.jsx";
import { ScheduleTab } from "./ScheduleTab.jsx";
import { StatsTab } from "./StatsTab.jsx";
import { ExpensesTab } from "./ExpensesTab.jsx";
import { CustomersTab } from "./CustomersTab.jsx";

export function AdminDashboard({ session, onSignOut }) {
  const [tab, setTab] = useState("requests");
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    fetchAllBookings().then(setBookings).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const act = async (id, status) => {
    setBusyId(id);
    try {
      await updateBookingStatus(id, status);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = bookings?.filter((b) => b.status === "pending") || [];

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#1D1E21]">
        <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[14px] font-bold uppercase tracking-wide">{CONFIG.businessName} · Owner</div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6]"><LogOut size={13} /> Sign out</button>
      </header>
      <main className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        {error && <ErrorBox message={error} />}
        {!bookings ? <LoadingBox center /> : (
          <>
            <div className="flex gap-1 bg-[#111214] border border-[#232529] rounded-lg p-1 mb-5">
              <TabButton active={tab === "requests"} onClick={() => setTab("requests")} icon={<Clock size={13} />} label={`Requests${pending.length ? ` (${pending.length})` : ""}`} />
              <TabButton active={tab === "schedule"} onClick={() => setTab("schedule")} icon={<CalendarDays size={13} />} label="Schedule" />
              <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon={<DollarSign size={13} />} label="Stats" />
            </div>
            <div className="flex gap-1 bg-[#111214] border border-[#232529] rounded-lg p-1 mb-5">
              <TabButton active={tab === "customers"} onClick={() => setTab("customers")} icon={<Users size={13} />} label="Customers" />
              <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")} icon={<Receipt size={13} />} label="Expenses" />
            </div>

            {tab === "requests" && <RequestsTab pending={pending} busyId={busyId} onAct={act} />}
            {tab === "schedule" && <ScheduleTab bookings={bookings} busyId={busyId} onAct={act} onRefresh={load} />}
            {tab === "stats" && <StatsTab bookings={bookings} />}
            {tab === "customers" && <CustomersTab bookings={bookings} />}
            {tab === "expenses" && <ExpensesTab userId={session.user.id} />}
          </>
        )}
      </main>
    </div>
  );
}
