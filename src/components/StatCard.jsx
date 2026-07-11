export function StatCard({ icon, label, value, accent }) {
  return (
    <div className="bg-[#111214] border border-[#232529] rounded-lg p-3">
      <div className={accent ? "text-[#D4AF37] mb-1.5" : "text-[#5C5F66] mb-1.5"}>{icon}</div>
      <div className="text-base font-bold leading-none mb-1">{value}</div>
      <div className="text-[10px] text-[#8B8F96] uppercase tracking-wide">{label}</div>
    </div>
  );
}
