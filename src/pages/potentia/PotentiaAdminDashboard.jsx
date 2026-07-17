import { useState } from "react";
import { LogOut, Target, Building2 } from "lucide-react";
import { TabButton } from "../../components/TabButton.jsx";
import { LeadsTab } from "./LeadsTab.jsx";
import { TenantsTab } from "./TenantsTab.jsx";

export function PotentiaAdminDashboard({ onSignOut }) {
  const [tab, setTab] = useState("leads");

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#1D1E21]">
        <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[14px] font-bold uppercase tracking-wide">
          Potentia · Platform
        </div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6]">
          <LogOut size={13} /> Sign out
        </button>
      </header>
      <main className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        <div className="flex gap-1 bg-[#111214] border border-[#232529] rounded-lg p-1 mb-5">
          <TabButton active={tab === "leads"} onClick={() => setTab("leads")} icon={<Target size={13} />} label="Leads" />
          <TabButton active={tab === "tenants"} onClick={() => setTab("tenants")} icon={<Building2 size={13} />} label="Tenants" />
        </div>

        {tab === "leads" && <LeadsTab />}
        {tab === "tenants" && <TenantsTab />}
      </main>
    </div>
  );
}
