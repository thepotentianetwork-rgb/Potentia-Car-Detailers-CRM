import { useState } from "react";
import { LogOut, Car, Receipt } from "lucide-react";
import { useTenant } from "../../context/TenantContext.jsx";
import { TabButton } from "../../components/TabButton.jsx";
import { InventoryTab } from "./InventoryTab.jsx";
import { ExpensesTab } from "./ExpensesTab.jsx";

export function DealershipDashboard({ session, onSignOut }) {
  const { config } = useTenant();
  const [tab, setTab] = useState("inventory");

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#1D1E21]">
        <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[14px] font-bold uppercase tracking-wide">{config.businessName} · Owner</div>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6]"><LogOut size={13} /> Sign out</button>
      </header>
      <main className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        <div className="flex gap-1 bg-[#111214] border border-[#232529] rounded-lg p-1 mb-5">
          <TabButton active={tab === "inventory"} onClick={() => setTab("inventory")} icon={<Car size={13} />} label="Inventory" />
          <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")} icon={<Receipt size={13} />} label="Expenses" />
        </div>
        {tab === "inventory" && <InventoryTab />}
        {tab === "expenses" && <ExpensesTab userId={session.user.id} />}
      </main>
    </div>
  );
}
