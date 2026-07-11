export function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium py-2 rounded-md transition-colors ${
        active ? "bg-[#1D1E21] text-[#F5F5F6]" : "text-[#8B8F96] hover:text-[#C9CDD3]"
      }`}
    >
      {icon} {label}
    </button>
  );
}
