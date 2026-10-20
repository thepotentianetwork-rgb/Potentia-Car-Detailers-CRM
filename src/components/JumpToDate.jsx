import { iso, dayIndexOnOrAfter } from "../lib/time.js";

// Native date box next to the day arrows, so a date months out is one tap
// instead of dozens of arrow clicks. Limited to the bookable days; a closed
// day snaps to the next open one.
export function JumpToDate({ days, index, onPick, className = "", label = "Jump to date" }) {
  if (!days.length) return null;
  return (
    <input
      type="date"
      aria-label={label}
      min={iso(days[0])}
      max={iso(days[days.length - 1])}
      value={iso(days[index] || days[0])}
      onChange={(e) => {
        if (!e.target.value) return;
        const i = dayIndexOnOrAfter(days, e.target.value);
        if (i >= 0) onPick(i);
      }}
      className={className}
    />
  );
}
