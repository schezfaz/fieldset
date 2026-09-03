"use client";

import { useRef, useState } from "react";
import { AnswerValue, Question } from "@/lib/types";

// Renders one question as a real interactive control. Used on the fill page (and as a
// live preview on the builder). When `agentTouched` is true the control wears the
// highlighter — the visual signature that the agent set this value.
export function FieldControl({
  q, value, onChange, agentTouched, disabled,
}: {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  agentTouched?: boolean;
  disabled?: boolean;
}) {
  const hl = agentTouched ? "agent-touched" : "";

  switch (q.kind) {
    case "section":
      return null; // rendered as a header by the parent

    case "short_text":
    case "email":
    case "url":
    case "phone": {
      const t = q.kind === "email" ? "email" : q.kind === "url" ? "url" : q.kind === "phone" ? "tel" : "text";
      const ph =
        q.kind === "email" ? "name@example.com" :
        q.kind === "url" ? "https://example.com" :
        q.kind === "phone" ? "+1 555 000 1234" : "Type your answer…";
      return (
        <input
          className={`input ${hl}`}
          type={t}
          value={(value as string) ?? ""}
          disabled={disabled}
          placeholder={ph}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }

    case "long_text":
    case "rich_text":
      return (
        <textarea
          className={`textarea ${hl}`}
          value={(value as string) ?? ""}
          disabled={disabled}
          placeholder={q.kind === "rich_text" ? "Type your answer… **Markdown** supported" : "Type your answer…"}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          className={`input ${hl}`}
          type="number"
          inputMode="decimal"
          value={value === undefined ? "" : String(value)}
          min={q.min}
          max={q.max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ maxWidth: 200 }}
        />
      );

    case "currency":
      return (
        <div className={`currency-wrap ${hl}`}>
          <span className="currency-sign">$</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={value === undefined ? "" : String(value)}
            min={q.min ?? 0}
            max={q.max}
            step="0.01"
            disabled={disabled}
            placeholder="0.00"
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ maxWidth: 180 }}
          />
        </div>
      );

    case "single_choice":
      return (
        <div className={`choice-group ${hl}`} role="radiogroup">
          {(q.options ?? []).map((opt) => (
            <label key={opt} className={`choice ${value === opt ? "checked" : ""}`}>
              <input type="radio" name={q.questionId} checked={value === opt} disabled={disabled} onChange={() => onChange(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );

    case "multi_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className={`choice-group ${hl}`}>
          {(q.options ?? []).map((opt) => {
            const on = arr.includes(opt);
            return (
              <label key={opt} className={`choice ${on ? "checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => onChange(on ? arr.filter((x) => x !== opt) : [...arr, opt])}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }

    case "dropdown":
      return (
        <select className={`select ${hl}`} value={(value as string) ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="" disabled>Choose…</option>
          {(q.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );

    case "ranking": {
      // Keep every option present, in the responder's chosen order (defaults to the given order).
      const opts = q.options ?? [];
      const arr = Array.isArray(value) && value.length === opts.length ? (value as string[]) : opts;
      const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= arr.length) return;
        const next = arr.slice();
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      const reorder = (from: number, to: number) => {
        if (from === to || Number.isNaN(from)) return;
        const next = arr.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(next);
      };
      return (
        <ol className={`rank-list ${hl}`}>
          {arr.map((opt, i) => (
            <li
              key={opt}
              className="rank-row"
              draggable={!disabled}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
              onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (!disabled) reorder(Number(e.dataTransfer.getData("text/plain")), i); }}
            >
              <span className="rank-grip mono" aria-hidden>⠿</span>
              <span className="rank-num mono">{i + 1}</span>
              <span className="rank-label">{opt}</span>
              <span className="rank-actions">
                <button type="button" className="icon-btn" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="icon-btn" disabled={disabled || i === arr.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              </span>
            </li>
          ))}
        </ol>
      );
    }

    case "rating": {
      const max = q.max ?? 5;
      const cur = typeof value === "number" ? value : 0;
      return (
        <div className={`rating ${hl}`}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" disabled={disabled} className={`star ${n <= cur ? "on" : ""}`} onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>
          ))}
          {cur > 0 && <span className="mono rating-num">{cur}/{max}</span>}
        </div>
      );
    }

    case "slider": {
      const min = q.min ?? 0, max = q.max ?? 100, step = q.step ?? 1;
      const cur = typeof value === "number" ? value : min;
      return (
        <div className={`slider-wrap ${hl}`}>
          <input type="range" min={min} max={max} step={step} value={cur} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="slider" />
          <span className="mono slider-num">{cur}</span>
        </div>
      );
    }

    case "yes_no":
      return (
        <div className={`toggle-group ${hl}`}>
          {["Yes", "No"].map((opt) => (
            <button key={opt} type="button" disabled={disabled} className={`toggle ${value === opt ? "on" : ""}`} onClick={() => onChange(opt)}>{opt}</button>
          ))}
        </div>
      );

    case "opinion_scale":
    case "nps": {
      const min = q.min ?? (q.kind === "nps" ? 0 : 1);
      const max = q.max ?? (q.kind === "nps" ? 10 : 5);
      const cur = typeof value === "number" ? value : null;
      const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className={`scale ${hl}`}>
          {nums.map((n) => (
            <button key={n} type="button" disabled={disabled} className={`scale-dot ${cur === n ? "on" : ""}`} onClick={() => onChange(n)}>{n}</button>
          ))}
        </div>
      );
    }

    case "matrix": {
      const rows = q.rows ?? [];
      const cols = q.options ?? [];
      // value is a string[] parallel to rows: the chosen column per row ("" if unset).
      const arr = Array.isArray(value) && value.length === rows.length ? (value as string[]) : rows.map(() => "");
      const pick = (ri: number, col: string) => onChange(rows.map((_, i) => (i === ri ? col : arr[i] ?? "")));
      return (
        <div className={`matrix-wrap ${hl}`}>
          <table className="matrix">
            <thead>
              <tr><th /> {cols.map((c) => <th key={c} className="matrix-col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row}>
                  <th className="matrix-row">{row}</th>
                  {cols.map((c) => (
                    <td key={c} className="matrix-cell">
                      <input type="radio" name={`${q.questionId}-${ri}`} checked={arr[ri] === c} disabled={disabled} onChange={() => pick(ri, c)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "date":
      return (
        <input className={`input ${hl}`} type="date" value={(value as string) ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 200 }} />
      );

    case "time":
      return (
        <input className={`input ${hl}`} type="time" value={(value as string) ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 160 }} />
      );

    case "color": {
      const cur = (value as string) || "#6b7cff";
      return (
        <div className={`color-wrap ${hl}`}>
          <input type="color" value={cur} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="color-swatch" />
          <span className="mono">{cur}</span>
        </div>
      );
    }

    case "address":
      return (
        <div className={`address-grid ${hl}`}>
          {["Street address", "City", "State / Region", "ZIP / Postal", "Country"].map((ph, i) => {
            const parts = (typeof value === "string" ? value : "").split("\n");
            return (
              <input
                key={ph}
                className={`input ${i === 0 ? "address-wide" : ""}`}
                value={parts[i] ?? ""}
                disabled={disabled}
                placeholder={ph}
                onChange={(e) => {
                  const next = parts.slice(); next[i] = e.target.value;
                  onChange(next.join("\n"));
                }}
              />
            );
          })}
        </div>
      );

    case "file":
      return <FileUpload hl={hl} value={value as string | undefined} onChange={onChange} disabled={disabled} />;

    case "signature":
      return <SignaturePad hl={hl} value={value as string | undefined} onChange={onChange} disabled={disabled} />;

    case "consent":
      return (
        <label className={`consent ${hl} ${value === "agreed" ? "checked" : ""}`}>
          <input type="checkbox" checked={value === "agreed"} disabled={disabled} onChange={(e) => onChange(e.target.checked ? "agreed" : "")} />
          <span>{q.label}</span>
        </label>
      );

    case "statement":
      return <p className={`statement ${hl}`}>{q.label}</p>;

    case "page_break":
      return <div className="page-break" aria-hidden><span>Page break</span></div>;

    case "image":
    case "video": {
      const src = q.options?.[0] ?? "";
      return (
        <div className={`media-embed ${hl}`}>
          {src ? (
            q.kind === "image"
              ? <img src={src} alt={q.label} />
              : <video src={src} controls style={{ maxWidth: "100%" }} />
          ) : (
            <div className="media-placeholder mono">{q.kind === "image" ? "▤ image URL not set" : "▷ video URL not set"}</div>
          )}
        </div>
      );
    }

    case "hidden":
      return disabled
        ? <p className="hidden-note mono">∅ hidden — “{q.label}”, not shown to responders</p>
        : null;

    default:
      return null;
  }
}

// Lightweight canvas signature — stores a data-URL string as the answer.
// Reads the chosen file into a data URL (same approach the signature pad already uses)
// so the answer actually carries the file's bytes, not just its name.
function FileUpload({
  hl, value, onChange, disabled,
}: { hl: string; value: string | undefined; onChange: (v: AnswerValue) => void; disabled?: boolean }) {
  const [name, setName] = useState("");
  const handle = (f: File | undefined) => {
    if (!f) return;
    setName(f.name);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ""));
    reader.readAsDataURL(f);
  };
  return (
    <label className={`file-drop ${hl}`}>
      <input type="file" disabled={disabled} onChange={(e) => handle(e.target.files?.[0])} style={{ display: "none" }} />
      <span className="file-glyph">⇪</span>
      <span>{name || (value ? "File uploaded" : "Choose a file…")}</span>
    </label>
  );
}

function SignaturePad({
  hl, value, onChange, disabled,
}: { hl: string; value: string | undefined; onChange: (v: AnswerValue) => void; disabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y);
  };
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#26303a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange("");
  };

  return (
    <div className={`sig ${hl}`}>
      <canvas
        ref={ref} width={360} height={120} className="sig-canvas"
        onPointerDown={start} onPointerMove={draw} onPointerUp={end} onPointerLeave={end}
      />
      <button type="button" className="sig-clear" onClick={clear} disabled={disabled}>Clear</button>
    </div>
  );
}
