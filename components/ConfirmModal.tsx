"use client";

import { useEffect, useState } from "react";

// Singleton confirm/alert queue: any code (including WebMCP tool `execute` closures, which run
// outside React render) can call requestConfirm()/requestAlert() and await the user's click.
// ConfirmModalHost is mounted once in the root layout and renders whichever request is currently
// pending, themed to match the publish-modal card instead of the native browser confirm()/alert().
type PendingRequest = { message: string; kind: "confirm" | "alert"; resolve: (v: boolean) => void };

let pending: PendingRequest | null = null;
type Listener = (r: PendingRequest | null) => void;
const listeners = new Set<Listener>();
const emit = () => { for (const l of listeners) l(pending); };

export function requestConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false); // shouldn't normally overlap, but never leak a promise
    pending = { message, kind: "confirm", resolve };
    emit();
  });
}

export function requestAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { message, kind: "alert", resolve: () => resolve() };
    emit();
  });
}

function settle(v: boolean) {
  const req = pending;
  pending = null;
  emit();
  req?.resolve(v);
}

export function ConfirmModalHost() {
  const [req, setReq] = useState<PendingRequest | null>(null);

  useEffect(() => {
    listeners.add(setReq);
    return () => { listeners.delete(setReq); };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  return (
    <div className="modal-overlay" onClick={() => settle(false)}>
      <div className="modal-card card confirm-card" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="modal-title confirm-message">{req.message}</p>
        <div className="modal-share-row confirm-actions">
          {req.kind === "confirm" && <button className="btn btn-ghost" onClick={() => settle(false)}>Cancel</button>}
          <button className="btn btn-primary" onClick={() => settle(true)} autoFocus>OK</button>
        </div>
      </div>
    </div>
  );
}
