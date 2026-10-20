import { emptyServiceAddress } from "../lib/serviceAddress";
import { useLang } from "../i18n/index.jsx";

// Street / city / ZIP for a mobile job. All three are required. Labels follow
// the customer language toggle (English outside a portal, e.g. staff forms).
export default function ServiceAddressFields({ value = emptyServiceAddress, onChange, inputCls = "", className = "" }) {
  const { t } = useLang();
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[1fr_9rem_6rem] gap-2 ${className}`}>
      <input aria-label={t("book.street")} required value={value.street} onChange={set("street")} placeholder={t("book.street")}
        autoComplete="address-line1" className={inputCls} />
      <input aria-label={t("book.city")} required value={value.city} onChange={set("city")} placeholder={t("book.city")}
        autoComplete="address-level2" className={inputCls} />
      <input aria-label={t("book.serviceZip")} required inputMode="numeric" maxLength={10} value={value.zip} onChange={set("zip")} placeholder={t("book.zip")}
        autoComplete="postal-code" className={inputCls} />
    </div>
  );
}
