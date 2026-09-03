import { QuestionKind } from "./types";

// Palette metadata — drives the manual "add element" buttons and the agent's tool enum.
export interface ElementDef {
  kind: QuestionKind;
  label: string;      // human label in the palette
  glyph: string;      // tiny monospace marker
  group: string;      // collapsible heading it lives under in the palette
  hasOptions?: boolean;
  hasRows?: boolean;  // matrix: a second axis of labels
  display?: boolean;  // structural/display-only — collects no answer
  defaults: () => Record<string, unknown>;
}

// The order groups appear in the palette. Each is a collapsible section.
export const GROUPS = [
  "Text & numbers",
  "Choices",
  "Scales & ratings",
  "Date & time",
  "Contact & media",
  "Layout & logic",
] as const;

export const ELEMENTS: ElementDef[] = [
  // --- Text & numbers ------------------------------------------------------
  { kind: "short_text",     label: "Short text",   glyph: "T", group: "Text & numbers", defaults: () => ({ label: "Short answer" }) },
  { kind: "long_text",      label: "Paragraph",    glyph: "¶", group: "Text & numbers", defaults: () => ({ label: "Long answer" }) },
  { kind: "email",          label: "Email",        glyph: "@", group: "Text & numbers", defaults: () => ({ label: "Your email" }) },
  { kind: "url",            label: "Website / URL",glyph: "↗", group: "Text & numbers", defaults: () => ({ label: "Your website" }) },
  { kind: "phone",          label: "Phone",        glyph: "☏", group: "Text & numbers", defaults: () => ({ label: "Phone number" }) },
  { kind: "number",         label: "Number",       glyph: "#", group: "Text & numbers", defaults: () => ({ label: "A number" }) },
  { kind: "currency",       label: "Currency",     glyph: "$", group: "Text & numbers", defaults: () => ({ label: "Amount", min: 0 }) },
  { kind: "rich_text",      label: "Rich text",    glyph: "≡", group: "Text & numbers", defaults: () => ({ label: "Formatted answer (Markdown)" }) },

  // --- Choices -------------------------------------------------------------
  { kind: "single_choice",  label: "Single choice",glyph: "◉", group: "Choices", hasOptions: true, defaults: () => ({ label: "Pick one", options: ["Option 1", "Option 2", "Option 3"] }) },
  { kind: "multi_choice",   label: "Checkboxes",   glyph: "☑", group: "Choices", hasOptions: true, defaults: () => ({ label: "Select all that apply", options: ["Option 1", "Option 2", "Option 3"] }) },
  { kind: "dropdown",       label: "Dropdown",     glyph: "▾", group: "Choices", hasOptions: true, defaults: () => ({ label: "Choose one", options: ["Option 1", "Option 2", "Option 3"] }) },
  { kind: "multi_dropdown", label: "Multi-select", glyph: "⊟", group: "Choices", hasOptions: true, defaults: () => ({ label: "Choose several", options: ["Option 1", "Option 2", "Option 3"] }) },
  { kind: "yes_no",         label: "Yes / No",     glyph: "⇄", group: "Choices", defaults: () => ({ label: "Yes or no?" }) },
  { kind: "ranking",        label: "Ranking",      glyph: "⇅", group: "Choices", hasOptions: true, defaults: () => ({ label: "Drag to rank", options: ["Option 1", "Option 2", "Option 3"] }) },

  // --- Scales & ratings ----------------------------------------------------
  { kind: "rating",         label: "Star rating",  glyph: "★", group: "Scales & ratings", defaults: () => ({ label: "Rate this", min: 1, max: 5 }) },
  { kind: "slider",         label: "Slider",       glyph: "▭", group: "Scales & ratings", defaults: () => ({ label: "On a scale", min: 0, max: 100, step: 1 }) },
  { kind: "opinion_scale",  label: "Opinion scale",glyph: "⊞", group: "Scales & ratings", defaults: () => ({ label: "How much do you agree?", min: 1, max: 5 }) },
  { kind: "nps",            label: "NPS (0–10)",   glyph: "◐", group: "Scales & ratings", defaults: () => ({ label: "How likely are you to recommend us?", min: 0, max: 10 }) },
  { kind: "matrix",         label: "Matrix / grid",glyph: "▥", group: "Scales & ratings", hasOptions: true, hasRows: true, defaults: () => ({ label: "Rate each", rows: ["Row 1", "Row 2"], options: ["Poor", "OK", "Great"] }) },

  // --- Date & time ---------------------------------------------------------
  { kind: "date",           label: "Date",         glyph: "▦", group: "Date & time", defaults: () => ({ label: "Pick a date" }) },
  { kind: "time",           label: "Time",         glyph: "◷", group: "Date & time", defaults: () => ({ label: "Pick a time" }) },

  // --- Contact & media -----------------------------------------------------
  { kind: "address",        label: "Address",      glyph: "⌂", group: "Contact & media", defaults: () => ({ label: "Your address" }) },
  { kind: "file",           label: "File upload",  glyph: "⇪", group: "Contact & media", defaults: () => ({ label: "Upload a file" }) },
  { kind: "signature",      label: "Signature",    glyph: "✎", group: "Contact & media", defaults: () => ({ label: "Sign here" }) },
  { kind: "color",          label: "Color",        glyph: "◨", group: "Contact & media", defaults: () => ({ label: "Pick a color" }) },
  { kind: "image",          label: "Image",        glyph: "▤", group: "Contact & media", display: true, defaults: () => ({ label: "Image caption", options: [""] }) },
  { kind: "video",          label: "Video",        glyph: "▷", group: "Contact & media", display: true, defaults: () => ({ label: "Video caption", options: [""] }) },

  // --- Layout & logic ------------------------------------------------------
  { kind: "section",        label: "Section",      glyph: "§", group: "Layout & logic", display: true, defaults: () => ({ label: "Section title" }) },
  { kind: "statement",      label: "Statement",    glyph: "❝", group: "Layout & logic", display: true, defaults: () => ({ label: "A note for the responder — no answer needed." }) },
  { kind: "page_break",     label: "Page break",   glyph: "⎯", group: "Layout & logic", display: true, defaults: () => ({ label: "Page break" }) },
  { kind: "consent",        label: "Consent",      glyph: "✓", group: "Layout & logic", defaults: () => ({ label: "I agree to the terms and conditions." }) },
  { kind: "hidden",         label: "Hidden field", glyph: "∅", group: "Layout & logic", display: true, defaults: () => ({ label: "utm_source" }) },
  { kind: "payment",        label: "Payment",      glyph: "⊕", group: "Layout & logic", display: true, defaults: () => ({ label: "Amount due", price: 10 }) },
];

export const elementByKind = (k: QuestionKind) => ELEMENTS.find((e) => e.kind === k);
export const KIND_ENUM = ELEMENTS.map((e) => e.kind);

// Elements bucketed into their palette headings, in GROUPS order.
export const elementsByGroup = (): { group: string; items: ElementDef[] }[] =>
  GROUPS.map((group) => ({ group, items: ELEMENTS.filter((e) => e.group === group) }));
