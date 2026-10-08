export function Field({ icon, ...props }) {
  return (
    <div className="flex items-center gap-2.5 bg-[var(--brand-input)] border border-[var(--brand-border)] rounded-lg px-3.5 py-2.5 focus-within:border-[var(--brand-border-hover)] transition-colors">
      <span className="text-[var(--brand-subtle)]">{icon}</span>
      <input {...props} className="bg-transparent outline-none text-sm text-[var(--brand-text)] placeholder-[var(--brand-subtle)] w-full" />
    </div>
  );
}
