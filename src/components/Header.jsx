import { Sparkles, LogOut, User } from "lucide-react";
import { CONFIG } from "../config.js";

export function Header({ loggedIn, onLogin, onDashboard, onSignOut }) {
  return (
    <header className="flex items-center justify-between px-5 py-4 border-b border-[#1D1E21]">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-md bg-gradient-to-br from-[#3A3D42] to-[#17181B] border border-[#3A3D42] flex items-center justify-center">
          <Sparkles size={16} strokeWidth={2} className="text-[#C9CDD3]" />
        </div>
        <div style={{ fontFamily: "Montserrat, sans-serif" }} className="text-[14px] font-bold tracking-wide uppercase">
          {CONFIG.businessName}
        </div>
      </div>
      {loggedIn ? (
        <div className="flex items-center gap-3">
          <button onClick={onDashboard} className="text-[13px] font-medium text-[#C9CDD3] hover:text-white">
            My Account
          </button>
          <button onClick={onSignOut} className="flex items-center gap-1.5 text-[12px] text-[#8B8F96] hover:text-[#F5F5F6]">
            <LogOut size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={onLogin}
          className="flex items-center gap-1.5 text-[13px] font-medium border border-[#2A2C30] hover:border-[#4A4D53] px-3.5 py-1.5 rounded-md transition-colors"
        >
          <User size={13} /> Log In
        </button>
      )}
    </header>
  );
}
