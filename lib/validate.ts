import { AnswerValue, Question } from "./types";

// Format/range check for an answer that's already present — missing/required is checked
// separately by each page's own validation(). Returns a human-readable reason, or null
// if the value is fine. Shared by the fill page and the responses API so client and
// server agree on what "valid" means.
export function invalidReason(q: Question, value: AnswerValue): string | null {
  switch (q.kind) {
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null : "not a valid email address";

    case "url":
      // Loose check: some text, a dot, a domain-like tail (e.g. "example.com") — no
      // protocol required, doesn't need to be a fully parseable URL.
      return typeof value === "string" && /^[^\s.]+(\.[^\s.]+)+$/.test(value.replace(/^https?:\/\//, "").split("/")[0])
        ? null : "not a valid website (expected something like example.com)";

    case "phone":
      return typeof value === "string" && /^[+\d][\d\s().-]{6,}$/.test(value)
        ? null : "not a valid phone number";

    case "number":
    case "currency":
    case "rating":
    case "slider":
    case "opinion_scale":
    case "nps": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return "not a number";
      if (q.min !== undefined && n < q.min) return `must be at least ${q.min}`;
      if (q.max !== undefined && n > q.max) return `must be at most ${q.max}`;
      return null;
    }

    default:
      return null;
  }
}
