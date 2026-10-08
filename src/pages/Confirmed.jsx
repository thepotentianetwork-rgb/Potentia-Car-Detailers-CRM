import { Check } from "lucide-react";
import { useTenant } from "../context/TenantContext.jsx";

export function Confirmed({ booking, onDone }) {
  const { config } = useTenant();
  const what = `${booking.service} (${booking.type === "mobile" ? "mobile" : "drop-off"}) on ${booking.dateLabel} at ${booking.time}.`;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-[#173D22] flex items-center justify-center mb-4"><Check size={22} className="text-[#5FCB7C]" /></div>
      <h1 style={{ fontFamily: "Montserrat, sans-serif" }} className="text-lg font-bold mb-1">
        {booking.guest && booking.name ? `Thanks, ${booking.name.split(" ")[0]}!` : "Request sent"}
      </h1>
      {booking.guest ? (
        // Guests have no account, and the app doesn't send texts or emails,
        // so promise only what happens: the shop gets in touch.
        <p className="text-sm text-[#8B8F96] mb-6 max-w-xs">
          We got your request for {what} {config.businessName} will reach out
          {booking.phone ? ` at ${booking.phone}` : ""} to confirm.
        </p>
      ) : (
        <p className="text-sm text-[#8B8F96] mb-6 max-w-xs">
          {what} Saved to your account — you'll get a confirmation once it's approved.
        </p>
      )}
      <button onClick={onDone} className="bg-[#E4E7EB] hover:bg-white text-[#0A0A0B] font-semibold text-sm px-6 py-2.5 rounded-lg">Done</button>
    </div>
  );
}
