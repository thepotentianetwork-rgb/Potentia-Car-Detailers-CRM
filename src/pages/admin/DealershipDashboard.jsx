import { useState } from "react";
import { Car, Receipt } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { DashboardLayout } from "../../components/DashboardLayout.jsx";
import { InventoryTab } from "./InventoryTab.jsx";
import { ExpensesTab } from "./ExpensesTab.jsx";
import { BookingLinkCard } from "../../components/BookingLinkCard.jsx";

export function DealershipDashboard({ session, onSignOut }) {
  const { tenant, config } = useTenant();
  const [tab, setTab] = useState("inventory");
  const nav = [
    { key: "inventory", label: "Inventory", icon: <Car size={13} /> },
    { key: "expenses", label: "Expenses", icon: <Receipt size={13} /> },
  ];

  return (
    <DashboardLayout title={`${config.businessName} · Owner`} nav={nav} active={tab} onSelect={setTab} onSignOut={onSignOut}
      top={<BookingLinkCard slug={tenant.slug} businessName={config.businessName} />}>
      {tab === "inventory" && <InventoryTab />}
      {tab === "expenses" && <ExpensesTab userId={session.user.id} />}
    </DashboardLayout>
  );
}
