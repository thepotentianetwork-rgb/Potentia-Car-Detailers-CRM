import { Check } from "lucide-react";

export function Confirmed({ booking, onDone }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-[#173D22] flex items-center justify-center mb-4"><Check size={22} className="text-[#5FCB7C]" /></div>
      <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-bold mb-1">Request sent</h1>
      <p className="text-sm text-[#8B8F96] mb-6 max-w-xs">
        {booking.service} ({booking.type === "mobile" ? "mobile" : "drop-off"}) on {booking.dateLabel} at {booking.time}. Saved to your account — you'll get a confirmation once it's approved.
      </p>
      <button onClick={onDone} className="bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm px-6 py-2.5 rounded-lg">Done</button>
    </div>
  );
}
