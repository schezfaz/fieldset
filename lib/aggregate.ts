import { elementByKind } from "./elements";
import { Form, FormResponse } from "./types";

export interface QuestionSummary {
  questionId: string;
  label: string;
  kind: string;
  counts?: Record<string, number>;        // choice / dropdown / multi / yes_no
  stats?: { mean: number; min: number; max: number; count: number }; // rating / slider / number
  samples?: string[];                       // text / email / date
}

export interface Aggregate {
  count: number;
  summary: QuestionSummary[];
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function aggregate(form: Form, responses: FormResponse[]): Aggregate {
  const summary: QuestionSummary[] = [];

  for (const q of form.questions) {
    if (elementByKind(q.kind)?.display) continue; // section, statement, media, hidden, payment, page break
    const values = responses
      .map((r) => r.answers.find((a) => a.questionId === q.questionId)?.value)
      .filter((v) => v !== undefined && v !== "");

    if (["single_choice", "dropdown", "yes_no", "multi_choice", "multi_dropdown", "ranking", "matrix", "consent"].includes(q.kind)) {
      const counts: Record<string, number> = {};
      for (const v of values) {
        const arr = Array.isArray(v) ? v : [v];
        for (const opt of arr) counts[String(opt)] = (counts[String(opt)] ?? 0) + 1;
      }
      summary.push({ questionId: q.questionId, label: q.label, kind: q.kind, counts });
    } else if (["rating", "slider", "number", "opinion_scale", "nps", "currency"].includes(q.kind)) {
      const nums = values.map(asNumber).filter((n): n is number => n !== null);
      if (nums.length) {
        const sum = nums.reduce((a, b) => a + b, 0);
        summary.push({
          questionId: q.questionId, label: q.label, kind: q.kind,
          stats: { mean: Math.round((sum / nums.length) * 100) / 100, min: Math.min(...nums), max: Math.max(...nums), count: nums.length },
        });
      } else {
        summary.push({ questionId: q.questionId, label: q.label, kind: q.kind, stats: { mean: 0, min: 0, max: 0, count: 0 } });
      }
    } else {
      summary.push({ questionId: q.questionId, label: q.label, kind: q.kind, samples: values.slice(0, 5).map(String) });
    }
  }

  return { count: responses.length, summary };
}
