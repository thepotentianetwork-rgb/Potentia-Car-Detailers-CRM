import { Loader2 } from "lucide-react";
import { useLang } from "../i18n/index.jsx";

export function LoadingBox({ center }) {
  const { t } = useLang();
  return (
    <div className={`flex items-center gap-2 text-[13px] text-[#8B8F96] py-6 ${center ? "justify-center flex-1" : ""}`}>
      <Loader2 size={14} className="animate-spin" /> {t("common.loading")}
    </div>
  );
}
