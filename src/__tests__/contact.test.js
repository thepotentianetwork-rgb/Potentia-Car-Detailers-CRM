import { describe, it, expect } from "vitest";
import { normalizePhone, formatPhone, isValidZip, isValidEmail } from "../lib/contact.js";

describe("contact helpers (same rules as request_booking)", () => {
  it("normalizePhone keeps 10-digit US numbers in any format and rejects the rest", () => {
    expect(normalizePhone("(555) 201-0001")).toBe("5552010001");
    expect(normalizePhone("+1 555 201 0001")).toBe("5552010001");
    expect(normalizePhone("555.201.0001")).toBe("5552010001");
    expect(normalizePhone("555-12")).toBe(null);
    expect(normalizePhone("25552010001")).toBe(null);
    expect(normalizePhone("")).toBe(null);
    expect(normalizePhone(undefined)).toBe(null);
  });

  it("formatPhone pretty-prints 10-digit numbers and leaves free text alone", () => {
    expect(formatPhone("5552010001")).toBe("(555) 201-0001");
    expect(formatPhone(" call the shop ")).toBe("call the shop");
  });

  it("isValidZip wants exactly 5 digits", () => {
    expect(isValidZip("80202")).toBe(true);
    expect(isValidZip("8020")).toBe(false);
    expect(isValidZip("80202-1234")).toBe(false);
    expect(isValidZip("abcde")).toBe(false);
  });

  it("isValidEmail is a light sanity check", () => {
    expect(isValidEmail("gina@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
