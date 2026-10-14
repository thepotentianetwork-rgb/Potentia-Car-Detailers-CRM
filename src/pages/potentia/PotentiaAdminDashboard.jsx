import { useState } from "react";
import { Target, Building2 } from "lucide-react";
import { DashboardLayout } from "../../components/DashboardLayout.jsx";
import { LeadsTab } from "./LeadsTab.jsx";
import { TenantsTab } from "./TenantsTab.jsx";

export function PotentiaAdminDashboard({ onSignOut }) {
  const [tab, setTab] = useState("leads");
  const nav = [
    { key: "leads", label: "Leads", icon: <Target size={13} /> },
    { key: "tenants", label: "Tenants", icon: <Building2 size={13} /> },
  ];

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
      <DashboardLayout title="Potentia · Platform" nav={nav} active={tab} onSelect={setTab} onSignOut={onSignOut}>
        {tab === "leads" && <LeadsTab />}
        {tab === "tenants" && <TenantsTab />}
      </DashboardLayout>
    </div>
  );
}
