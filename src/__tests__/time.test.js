import { describe, it, expect, vi, afterEach } from "vitest";
import { iso, getNextDays, getAvailableStarts, earliestStartFor, dayLabel, MIN_LEAD_MIN } from "../lib/time.js";

// vitest.config.js runs tests in UTC, so the "browser" here is never in the
// business's zone (America/Denver).
const DENVER = "America/Denver";
const hours = { start: "9:00 AM", end: "5:00 PM" };

describe("iso() date keys", () => {
  it("uses the business's calendar day, not UTC (7:30 PM in Denver is still Oct 8)", () => {
    const evening = new Date("2026-10-09T01:30:00Z"); // 7:30 PM MDT, Oct 8
    expect(iso(evening, DENVER)).toBe("2026-10-08");
  });

  it("still gives the same day in the morning", () => {
    expect(iso(new Date("2026-10-08T15:00:00Z"), DENVER)).toBe("2026-10-08");
  });

  it("works in winter (MST, UTC-7) too", () => {
    expect(iso(new Date("2026-12-02T05:30:00Z"), DENVER)).toBe("2026-12-01"); // 10:30 PM MST Dec 1
  });
});

describe("getNextDays()", () => {
  afterEach(() => vi.useRealTimers());

  it("starts from today in the business's zone, even when that is 'yesterday' in UTC", () => {
    // The clock is somewhere else entirely, so only the `now` argument can
    // produce these dates.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    const days = getNextDays(6, DENVER, new Date("2026-10-09T01:30:00Z"));
    expect(days).toHaveLength(6);
    expect(days.map((d) => iso(d))).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
    expect(dayLabel(days[0])).toBe("Thu, Oct 8");
  });

  it("crosses month ends and the DST change without skipping or repeating a day", () => {
    const days = getNextDays(4, DENVER, new Date("2026-10-31T18:00:00Z")); // DST ends Nov 1
    expect(days.map((d) => iso(d))).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("past slots today", () => {
  it("lead time matches the server's 30 minutes", () => {
    expect(MIN_LEAD_MIN).toBe(30);
  });

  it("doesn't offer start times that already passed (plus lead time) today", () => {
    const now = new Date("2026-10-08T19:05:00Z"); // 1:05 PM MDT
    const minStart = earliestStartFor("2026-10-08", now, DENVER);
    expect(minStart).toBe(13 * 60 + 5 + 30);
    const starts = getAvailableStarts([], 60, "dropoff", hours, 30, 30, minStart);
    expect(starts[0]).toBe(14 * 60); // 2:00 PM is the first slot at or after 1:35 PM
    expect(starts).not.toContain(13 * 60 + 30);
  });

  it("offers the whole day for a future date", () => {
    const now = new Date("2026-10-08T19:05:00Z");
    expect(earliestStartFor("2026-10-09", now, DENVER)).toBe(0);
    expect(getAvailableStarts([], 60, "dropoff", hours, 30, 30, 0)[0]).toBe(9 * 60);
  });

  it("uses the business's clock, not UTC, to decide what 'today' and 'now' are", () => {
    // 7:30 PM MDT Oct 8 = 01:30 UTC Oct 9. Oct 8 is still today in Denver and
    // the day is over (after 5 PM), so nothing is left.
    const now = new Date("2026-10-09T01:30:00Z");
    const minStart = earliestStartFor("2026-10-08", now, DENVER);
    expect(minStart).toBe(19 * 60 + 30 + 30);
    expect(getAvailableStarts([], 60, "dropoff", hours, 30, 30, minStart)).toEqual([]);
    expect(earliestStartFor("2026-10-09", now, DENVER)).toBe(0);
  });

  it("staff can pass a lead time of 0", () => {
    const now = new Date("2026-10-08T19:05:00Z");
    expect(earliestStartFor("2026-10-08", now, DENVER, 0)).toBe(13 * 60 + 5);
  });

  it("existing callers without minStart still get every free slot", () => {
    expect(getAvailableStarts([], 60, "dropoff", hours, 60, 30)).toEqual([540, 600, 660, 720, 780, 840, 900, 960]);
  });
});
