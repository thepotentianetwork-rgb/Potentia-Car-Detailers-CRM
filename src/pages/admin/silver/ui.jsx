// Silver-and-black look for the owner/staff dashboard (ownerTheme "silver",
// Juan's Auto Detailing). Plain colors, no photos.
export const S = {
  bg: "#0A0A0B",
  panel: "#131315",
  panel2: "#18181B",
  border: "#26262A",
  text: "#ECEDEF",
  muted: "#8E9196",
  silver: "#C3C7CD",
  silverHi: "#E6E8EB",
};

export const STATUS_PILL = {
  pending: { label: "New request", cls: "bg-[#3A2F12] text-[#E8C46A]" },
  approved: { label: "Scheduled", cls: "bg-[#1C2A40] text-[#9DBDEB]" },
  completed: { label: "Completed", cls: "bg-[#173322] text-[#7FD49A]" },
  declined: { label: "Declined", cls: "bg-[#3B1919] text-[#E59595]" },
  cancelled: { label: "Cancelled", cls: "bg-[#26262A] text-[#A3A6AB]" },
};

// Light variant for the customers table.
export const STATUS_PILL_LIGHT = {
  pending: "bg-[#FDF0D5] text-[#8A5A00]",
  approved: "bg-[#E1ECFB] text-[#1F4E8C]",
  completed: "bg-[#DDF3E4] text-[#1E6B3A]",
  declined: "bg-[#FBE1E1] text-[#922B2B]",
  cancelled: "bg-[#ECEDEF] text-[#55585E]",
};

export function StatusPill({ status, light = false }) {
  const p = STATUS_PILL[status] || { label: status, cls: "bg-[#26262A] text-[#A3A6AB]" };
  const cls = light ? STATUS_PILL_LIGHT[status] || "bg-[#ECEDEF] text-[#55585E]" : p.cls;
  return <span data-status={status} className={`inline-block whitespace-nowrap text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>{p.label}</span>;
}

export function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`bg-[#131315] border border-[#26262A] rounded-xl p-4 lg:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-[15px] font-semibold text-[#ECEDEF]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <div className="text-center py-8 text-[13px] text-[#6E7176] border border-dashed border-[#26262A] rounded-lg">{children}</div>;
}

export function Stat({ icon, label, value, sub }) {
  return (
    <div className="bg-[#131315] border border-[#26262A] rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#2B2C30] to-[#18181B] border border-[#33343A] text-[#C3C7CD] flex items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <div className="text-[12px] text-[#8E9196]">{label}</div>
        <div className="text-[22px] lg:text-[26px] font-bold leading-tight text-[#ECEDEF]">{value}</div>
        {sub && <div className="text-[11px] text-[#6E7176]">{sub}</div>}
      </div>
    </div>
  );
}

export const money = (cents) => `$${Math.round((cents || 0) / 100).toLocaleString("en-US")}`;
export const pct = (r) => (r == null ? "—" : `${Math.round(r * 100)}%`);

export function timeAgo(ts, now = new Date()) {
  const s = Math.max(0, (now - new Date(ts)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
