import { AlertCircle } from "lucide-react";

export function ErrorBox({ message }) {
  return (
    <div className="flex items-start gap-2 bg-[#3D1515] border border-[#5C2323] rounded-lg px-3.5 py-2.5 text-[12px] text-[#E08A8A] mb-3">
      <AlertCircle size={14} className="shrink-0 mt-0.5" /> {message}
    </div>
  );
}
