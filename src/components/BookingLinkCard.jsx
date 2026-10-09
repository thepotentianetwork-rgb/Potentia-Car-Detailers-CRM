import { useEffect, useRef, useState } from "react";
import { Link2, Copy, Check, ExternalLink, Share2 } from "lucide-react";
import { SITE_ORIGIN } from "../tenants/linkPreviews.js";

// The public booking page customers use. Always the production address, so
// owners copy the link they should actually share (even on a preview build).
export function bookingUrl(slug) {
  return `${SITE_ORIGIN}/crm/${encodeURIComponent(slug)}/portal`;
}

const btn =
  "flex-1 flex items-center justify-center gap-1.5 border border-[#2A2C30] hover:border-[#4A4D53] text-[#F5F5F6] text-[12px] font-semibold py-2 rounded-lg transition-colors";

// "Your booking link" card at the top of the owner dashboard.
export function BookingLinkCard({ slug, businessName }) {
  const url = bookingUrl(slug);
  const [status, setStatus] = useState(""); // "" | "copied" | "manual"
  const inputRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const flash = (s) => {
    setStatus(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), s === "copied" ? 2000 : 5000);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      flash("copied");
    } catch {
      // Older browsers / non-secure contexts: select the text instead.
      const el = inputRef.current;
      const sel = window.getSelection?.();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      let ok = false;
      try {
        ok = document.execCommand?.("copy") === true;
      } catch {
        ok = false;
      }
      flash(ok ? "copied" : "manual");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: businessName, text: `Book with ${businessName}`, url });
    } catch {
      // Cancelled or unsupported: nothing to do.
    }
  };

  return (
    <section aria-label="Your booking link" className="bg-[#111214] border border-[#232529] rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 text-[13px] font-semibold mb-1">
        <Link2 size={14} className="text-[#8B8F96]" /> Your booking link
      </div>
      <p className="text-[12px] text-[#8B8F96] mb-3">Share it with customers, or add it to your website and social profiles.</p>
      <div
        ref={inputRef}
        aria-label="Booking link"
        className="w-full bg-[#0D0E10] border border-[#232529] rounded-lg px-3 py-2 text-[12px] text-[#C9CDD3] break-all select-all mb-3"
      >
        {url}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={btn}>
          {status === "copied" ? <Check size={13} /> : <Copy size={13} />}
          {status === "copied" ? "Copied!" : "Copy"}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={btn}>
          <ExternalLink size={13} /> Open
        </a>
        {canShare && (
          <button type="button" onClick={share} className={btn}>
            <Share2 size={13} /> Share
          </button>
        )}
      </div>
      {status === "manual" && <p className="text-[12px] text-[#8B8F96] mt-2">Couldn't copy automatically. The link is selected above; copy it from there.</p>}
    </section>
  );
}
