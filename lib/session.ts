"use client";

// Per-browser respondent id, used so oneResponsePerPerson dedup works.
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let s = localStorage.getItem("fieldset_sid");
    if (!s) { s = crypto.randomUUID(); localStorage.setItem("fieldset_sid", s); }
    return s;
  } catch { return "anon"; }
}
