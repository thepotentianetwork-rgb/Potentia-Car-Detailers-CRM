import { LogOut } from "lucide-react";
import { TabButton } from "./TabButton.jsx";
import { useIsDesktop } from "../lib/useMediaQuery.js";

// Shared shell for the owner/staff, dealership and Potentia host dashboards.
// Phones and tablets (< 1024px) keep the original layout: a narrow column
// with rows of tabs. From Tailwind's lg breakpoint up, the tabs move into a
// left sidebar and the main area gets wide (max-w-6xl) so tables, schedules
// and cards use the screen instead of a 448px strip.
//
// nav: [{ key, label, icon, row }] - `row` groups tabs into the phone tab rows.
export function DashboardLayout({ title, nav, active, onSelect, onSignOut, children, top = null }) {
  const desktop = useIsDesktop();
  const rows = [];
  for (const item of nav) (rows[item.row || 0] ||= []).push(item);

  return (
    <div className="flex-1 flex" data-layout={desktop ? "desktop" : "mobile"}>
      {desktop && (
        <aside aria-label="Dashboard navigation" className="w-60 shrink-0 border-r border-[#1D1E21] bg-[#0D0E10] flex flex-col sticky top-0 h-screen">
          <div style={{ fontFamily: "Montserrat, sans-serif" }} className="px-5 py-5 text-[13px] font-bold uppercase tracking-wide border-b border-[#1D1E21]">{title}</div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {nav.map((item) => (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                aria-current={active === item.key ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 text-[13px] font-medium px-3 py-2 rounded-md transition-colors ${
                  active === item.key ? "bg-[#1D1E21] text-[#F5F5F6]" : "text-[#8B8F96] hover:text-[#C9CDD3] hover:bg-[#141518]"
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
          <button onClick={onSignOut} className="m-3 flex items-center gap-2 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6] px-3 py-2"><LogOut size={13} /> Sign out</button>
        </aside>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {!desktop && (
          <header className="flex items-center justify-between px-5 py-4 border-b border-[#1D1E21]">
            <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[14px] font-bold uppercase tracking-wide">{title}</div>
            <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6]"><LogOut size={13} /> Sign out</button>
          </header>
        )}
        <main className="flex-1 px-5 py-6 lg:px-10 lg:py-8 max-w-md lg:max-w-6xl mx-auto w-full">
          {top}
          {!desktop && nav.length > 1 && rows.map((row, i) => (
            <div key={i} className="flex gap-1 bg-[#111214] border border-[#232529] rounded-lg p-1 mb-5">
              {row.map((item) => (
                <TabButton key={item.key} active={active === item.key} onClick={() => onSelect(item.key)} icon={item.icon} label={item.label} />
              ))}
            </div>
          ))}
          {children}
        </main>
      </div>
    </div>
  );
}
