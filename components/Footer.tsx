"use client";

import { SOCIALS, SvgIcon } from "@/components/SocialIcons";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-line">
          Built for the{" "}
          <a href="https://openai.com/webmcp-challenge/" target="_blank" rel="noopener noreferrer" className="site-footer-name-link">
            WebMCP Challenge
          </a>
        </p>
        <p className="site-footer-line muted">
          Built by{" "}
          <a href="https://www.linkedin.com/in/schezeenfazulbhoy/" target="_blank" rel="noopener noreferrer" className="site-footer-name-link">
            Schezeen Fazulbhoy
          </a>
        </p>

        <div className="site-footer-socials">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target={s.href.startsWith("mailto") ? undefined : "_blank"}
              rel="noopener noreferrer"
              aria-label={s.label}
              className="site-footer-icon"
              title={s.label}
            >
              <SvgIcon paths={s.paths} evenodd={"evenodd" in s ? (s as { evenodd: boolean }).evenodd : undefined} />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
