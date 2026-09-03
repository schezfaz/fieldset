"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let t: Theme = "light";
    try { t = (localStorage.getItem("fieldset-theme") as Theme) || "light"; } catch { /* noop */ }
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fieldset-theme", next); } catch { /* noop */ }
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}
