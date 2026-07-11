import { Loader2 } from "lucide-react";

export function LoadingBox({ center }) {
  return (
    <div className={`flex items-center gap-2 text-[13px] text-[#8B8F96] py-6 ${center ? "justify-center flex-1" : ""}`}>
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>
  );
}
