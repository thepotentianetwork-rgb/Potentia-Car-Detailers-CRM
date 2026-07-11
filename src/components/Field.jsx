export function Field({ icon, ...props }) {
  return (
    <div className="flex items-center gap-2.5 bg-[#0D0E10] border border-[#232529] rounded-lg px-3.5 py-2.5 focus-within:border-[#4A4D53] transition-colors">
      <span className="text-[#5C5F66]">{icon}</span>
      <input {...props} className="bg-transparent outline-none text-sm text-[#F5F5F6] placeholder-[#5C5F66] w-full" />
    </div>
  );
}
