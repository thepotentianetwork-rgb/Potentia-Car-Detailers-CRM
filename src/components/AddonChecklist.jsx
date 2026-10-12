import { addonLabel } from "../lib/addons.js";

// Owner-dashboard add-on picker (any number can be checked).
export function AddonChecklist({ addons, selectedIds, onChange, className = "" }) {
  if (!addons?.length) return null;
  const toggle = (id) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  return (
    <fieldset className={className}>
      <legend className="text-[11px] uppercase tracking-wide text-[#8B8F96] mb-1.5 block">Add-ons</legend>
      <div className="space-y-1">
        {addons.map((a) => (
          <label key={a.id} className="flex items-center gap-2 text-[12px] text-[#C9CDD3] cursor-pointer">
            <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} />
            <span>{addonLabel(a)}{a.active === false ? " (inactive)" : ""}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
