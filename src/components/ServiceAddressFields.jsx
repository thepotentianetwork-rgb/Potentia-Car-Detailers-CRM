import { emptyServiceAddress } from "../lib/serviceAddress";

// Street / city / ZIP for a mobile job. All three are required.
export default function ServiceAddressFields({ value = emptyServiceAddress, onChange, inputCls = "", className = "" }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[1fr_9rem_6rem] gap-2 ${className}`}>
      <input aria-label="Street address" required value={value.street} onChange={set("street")} placeholder="Street address"
        autoComplete="address-line1" className={inputCls} />
      <input aria-label="City" required value={value.city} onChange={set("city")} placeholder="City"
        autoComplete="address-level2" className={inputCls} />
      <input aria-label="Service ZIP" required inputMode="numeric" maxLength={10} value={value.zip} onChange={set("zip")} placeholder="ZIP"
        autoComplete="postal-code" className={inputCls} />
    </div>
  );
}
