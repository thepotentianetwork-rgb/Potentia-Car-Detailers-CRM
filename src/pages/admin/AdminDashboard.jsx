import { useState, useEffect } from "react";
import { Clock, CalendarDays, DollarSign, Receipt, Users, FileText, Wrench } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { fetchTenantBookings, updateBookingStatus } from "../../api/bookings.js";
import { DashboardLayout } from "../../components/DashboardLayout.jsx";
import { getTenantBranding } from "../../tenants/branding.js";
import { SilverDashboard } from "./silver/SilverDashboard.jsx";
import { LoadingBox } from "../../components/LoadingBox.jsx";
import { ErrorBox } from "../../components/ErrorBox.jsx";
import { RequestsTab } from "./RequestsTab.jsx";
import { ScheduleTab } from "./ScheduleTab.jsx";
import { StatsTab } from "./StatsTab.jsx";
import { ExpensesTab } from "./ExpensesTab.jsx";
import { CustomersTab } from "./CustomersTab.jsx";
import { InvoicesTab } from "./InvoicesTab.jsx";
import { ServicesTab } from "./ServicesTab.jsx";
import { BookingLinkCard } from "../../components/BookingLinkCard.jsx";

export function AdminDashboard({ session, onSignOut, ownerName }) {
  const { tenant, config } = useTenant();
  const [tab, setTab] = useState("requests");
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    fetchTenantBookings(tenant.id).then(setBookings).catch((e) => setError(e.message));
  };
  useEffect(() => {
    setBookings(null);
    load();
  }, [tenant.id]);

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

  if (getTenantBranding(tenant.slug).ownerTheme === "silver") {
    return (
      <SilverDashboard session={session} ownerName={ownerName} onSignOut={onSignOut} bookings={bookings} error={error} busyId={busyId} onAct={act} onRefresh={load} />
    );
  }

  const nav = [
    { key: "requests", label: `Requests${pending.length ? ` (${pending.length})` : ""}`, icon: <Clock size={13} />, row: 0 },
    { key: "schedule", label: "Schedule", icon: <CalendarDays size={13} />, row: 0 },
    { key: "stats", label: "Stats", icon: <DollarSign size={13} />, row: 0 },
    { key: "customers", label: "Customers", icon: <Users size={13} />, row: 1 },
    { key: "invoices", label: "Invoices", icon: <FileText size={13} />, row: 1 },
    { key: "expenses", label: "Expenses", icon: <Receipt size={13} />, row: 1 },
    { key: "services", label: "Services", icon: <Wrench size={13} />, row: 1 },
  ];

  return (
    <DashboardLayout title={`${config.businessName} · Owner`} nav={bookings ? nav : []} active={tab} onSelect={setTab} onSignOut={onSignOut}
      top={<><BookingLinkCard slug={tenant.slug} businessName={config.businessName} />{error && <ErrorBox message={error} />}</>}>
      {!bookings ? <LoadingBox center /> : (
        <>
          {tab === "requests" && <RequestsTab pending={pending} busyId={busyId} onAct={act} allBookings={bookings} onRefresh={load} />}
          {tab === "schedule" && <ScheduleTab bookings={bookings} busyId={busyId} onAct={act} onRefresh={load} />}
          {tab === "stats" && <StatsTab bookings={bookings} />}
          {tab === "customers" && <CustomersTab bookings={bookings} tenantId={tenant.id} />}
          {tab === "invoices" && <InvoicesTab bookings={bookings} onRefresh={load} />}
          {tab === "expenses" && <ExpensesTab userId={session.user.id} />}
          {tab === "services" && <ServicesTab />}
        </>
      )}
    </DashboardLayout>
  );
}
