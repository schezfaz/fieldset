// Ready-made example forms. The `onSite` ones show as buttons on the home page; clicking
// one creates a real form, adds every question, PUBLISHES it, and drops you on its fill
// page — so a human (or their agent) can fill it immediately.
//
// Each form is deliberately loaded with the richer field kinds (slider, number, matrix,
// date/time, dropdown, ranking, currency) so the demo and the judges see the range.

import type { QuestionKind } from "./types";

export interface SampleQuestion {
  kind: QuestionKind;
  label: string;
  required?: boolean;
  options?: string[];
  rows?: string[];
  min?: number;
  max?: number;
  step?: number;
  key?: string;
  dependsOnKey?: string;
  optionsMap?: Record<string, string[]>;
}

export interface Sample {
  slug: string;
  glyph: string;
  title: string;
  description: string;
  onSite: boolean; // shown as a button on the home page
  questions: SampleQuestion[];
}

export const SAMPLES: Sample[] = [
  // 1 — Group party food order (DEMO ONLY: built live by the agent in the recorded demo)
  {
    slug: "group-food-order",
    glyph: "🍕",
    title: "Group party food order",
    description: "Collect everyone's order for a group food run, then tally it up.",
    onSite: true,
    questions: [
      { kind: "short_text", label: "Your name", required: true },
      { kind: "currency", label: "Your budget for this order", required: true, min: 0, max: 100 },
      { kind: "multi_choice", label: "Dietary preferences", options: ["Vegetarian", "Non-vegetarian", "Vegan", "Gluten-free", "Halal", "No restrictions"] },
      { kind: "slider", label: "Spice level (0 = mild, 5 = fiery)", min: 0, max: 5, step: 1 },
      { kind: "dropdown", label: "Cuisine you're craving", required: true, key: "cuisine", options: ["Italian", "Mexican", "Thai", "Indian", "Japanese", "American"] },
      { kind: "multi_choice", label: "Which main(s) would you like?", required: true, dependsOnKey: "cuisine", optionsMap: {
        Italian: ["Margherita pizza", "Pepperoni pizza", "Spaghetti carbonara", "Eggplant parmesan", "Fettuccine alfredo"],
        Mexican: ["Chicken burrito", "Beef tacos", "Veggie quesadilla", "Enchiladas", "Carnitas bowl"],
        Thai: ["Pad thai", "Green curry", "Pad see ew", "Massaman curry", "Basil fried rice"],
        Indian: ["Butter chicken", "Chicken tikka masala", "Paneer tikka", "Chana masala", "Lamb biryani"],
        Japanese: ["Chicken katsu", "Salmon sushi roll", "Shoyu ramen", "Teriyaki tofu bowl", "Beef gyudon"],
        American: ["Cheeseburger", "BBQ ribs", "Mac & cheese", "Buffalo wings", "Fried chicken sandwich"],
      } },
      { kind: "matrix", label: "Add-ons — pick one per row", rows: ["Drink", "Side", "Dessert", "Appetizer"], options: ["Yes please", "No thanks", "Surprise me!"] },
      { kind: "time", label: "Preferred delivery time" },
    ],
  },

  // 2 — Pool party RSVP (on site)
  {
    slug: "pool-party-rsvp",
    glyph: "🏊",
    title: "Pool party RSVP",
    description: "Headcount, availability, and who's actually getting in the pool.",
    onSite: true,
    questions: [
      { kind: "short_text", label: "Your name", required: true },
      { kind: "yes_no", label: "Can you make it?", required: true },
      { kind: "number", label: "How many +1s are you bringing?", min: 0, max: 5 },
      { kind: "matrix", label: "When are you free?", rows: ["Friday", "Saturday", "Sunday"], options: ["Morning", "Afternoon", "Evening"] },
      { kind: "yes_no", label: "Will you actually get in the pool?" },
      { kind: "dropdown", label: "What will you bring?", options: ["Drinks", "Snacks", "Dessert", "Pool floats", "Nothing"] },
      { kind: "multi_choice", label: "Dietary needs", options: ["Vegetarian", "Vegan", "Gluten-free", "Nut allergy", "None"] },
    ],
  },

  // 3 — Course feedback (on site)
  {
    slug: "course-feedback",
    glyph: "🎓",
    title: "Course feedback",
    description: "End-of-term feedback: rate the course and tell us what to improve.",
    onSite: true,
    questions: [
      { kind: "dropdown", label: "Which course is this for?", required: true, options: ["CS101 — Intro to Computer Science", "CS201 — Data Structures", "CS310 — Algorithms", "CS350 — Databases", "CS401 — Machine Learning"] },
      { kind: "single_choice", label: "Semester", required: true, options: ["Fall 2025", "Spring 2026", "Summer 2026"] },
      { kind: "rating", label: "Overall, how would you rate this course?", min: 1, max: 5 },
      { kind: "matrix", label: "Rate each aspect", rows: ["Instructor", "Course materials", "Workload", "Pace"], options: ["Poor", "OK", "Great"] },
      { kind: "long_text", label: "What could be improved?" },
    ],
  },

  // 4 — Movie night vote (on site)
  {
    slug: "movie-night-vote",
    glyph: "🎬",
    title: "Movie night vote",
    description: "Rank the picks, choose snacks, and settle on a time.",
    onSite: true,
    questions: [
      { kind: "short_text", label: "Your name", required: true },
      { kind: "ranking", label: "Rank these movies (favorite first)", options: ["Dune: Part Two", "Everything Everywhere All at Once", "Spider-Verse", "The Grand Budapest Hotel"] },
      { kind: "single_choice", label: "Snack of choice", options: ["Popcorn", "Nachos", "Candy", "Ice cream"] },
      { kind: "time", label: "What time works for you?" },
      { kind: "opinion_scale", label: "How excited are you? (1–5)", min: 1, max: 5 },
    ],
  },
];

export const SITE_SAMPLES = SAMPLES.filter((s) => s.onSite);
