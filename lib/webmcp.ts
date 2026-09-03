"use client";

import { useEffect, useRef } from "react";

// A WebMCP tool definition. Verified against Chrome 152: the working registration call is
// navigator.modelContext.registerTool(tool), one at a time (see ../../tools.md).
export type ToolDef = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>, client?: unknown) => Promise<unknown>;
};

type ModelContext = {
  registerTool?: (tool: ToolDef) => void;
  unregisterTool?: (name: string) => void;
};

export function getModelContext(): ModelContext | null {
  if (typeof navigator !== "undefined" && (navigator as unknown as { modelContext?: ModelContext }).modelContext) {
    return (navigator as unknown as { modelContext: ModelContext }).modelContext;
  }
  if (typeof document !== "undefined" && (document as unknown as { modelContext?: ModelContext }).modelContext) {
    return (document as unknown as { modelContext: ModelContext }).modelContext;
  }
  return null;
}

export function webmcpAvailable(): boolean {
  const mc = getModelContext();
  return !!(mc && typeof mc.registerTool === "function");
}

// Names currently registered with the model context, so a Strict Mode / HMR remount that
// can't unregister (no unregisterTool in the shim) doesn't try to register a duplicate.
const liveTools = new Set<string>();

// Register a page's tools once on mount; each tool's execute always delegates to the freshest
// closure via a ref, so tools see current React state without re-registering. The tool *set*
// (names/schemas) is captured at mount — fine, since each page has a fixed set of tools.
export function useWebMCP(buildTools: () => ToolDef[]) {
  const buildRef = useRef(buildTools);
  buildRef.current = buildTools;

  useEffect(() => {
    const mc = getModelContext();
    if (!mc || typeof mc.registerTool !== "function") return;

    const defs = buildRef.current();
    const wrapped: ToolDef[] = defs.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema,
      annotations: d.annotations,
      execute: async (input, client) => {
        const current = buildRef.current().find((x) => x.name === d.name);
        if (!current) return { ok: false, error: { code: "gone", message: "tool unavailable" } };
        try {
          return await current.execute(input, client);
        } catch (e) {
          return { ok: false, error: { code: "exec_failed", message: String(e) } };
        }
      },
    }));

    for (const t of wrapped) {
      // Clear any lingering registration first — Strict Mode's double-mount (and HMR
      // remounts) can leave a prior registration behind, and re-registering the same
      // name throws / rejects with "Duplicate tool name".
      if (typeof mc.unregisterTool === "function") { try { mc.unregisterTool(t.name); } catch { /* noop */ } }
      else if (liveTools.has(t.name)) continue; // can't unregister; don't duplicate
      try {
        const r = mc.registerTool!(t) as unknown;
        liveTools.add(t.name);
        // registerTool may reject asynchronously (e.g. duplicate name); don't let it
        // bubble up as an unhandledRejection.
        if (r && typeof (r as Promise<unknown>).then === "function") {
          (r as Promise<unknown>).catch((e) => console.warn("registerTool rejected", t.name, e));
        }
      } catch (e) { console.warn("registerTool failed", t.name, e); }
    }
    return () => {
      // Only forget a tool from the registry if we could actually unregister it; otherwise
      // it's still live in the shim and must stay tracked so we don't re-register a duplicate.
      if (typeof mc.unregisterTool !== "function") return;
      for (const t of wrapped) {
        try { mc.unregisterTool(t.name); } catch { /* noop */ }
        liveTools.delete(t.name);
      }
    };
    // register once on mount; freshness handled via buildRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Confirmation gate for mutating tools. Tries the spec'd requestUserInteraction, falls back
// to window.confirm. Returns true if the user approved.
export async function confirmGate(client: unknown, message: string): Promise<boolean> {
  const c = client as { requestUserInteraction?: (cb: () => Promise<boolean>) => Promise<boolean> } | undefined;
  try {
    if (c && typeof c.requestUserInteraction === "function") {
      return await c.requestUserInteraction(async () => window.confirm(message));
    }
  } catch { /* fall through */ }
  return typeof window !== "undefined" ? window.confirm(message) : true;
}
