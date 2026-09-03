export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="brand-mark-clip">
          <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#brand-mark-clip)" stroke="currentColor" strokeWidth="1.8">
        <line x1="-3" y1="19" x2="19" y2="-3" />
        <line x1="3" y1="25" x2="25" y2="3" />
        <line x1="-9" y1="13" x2="13" y2="-9" />
        <line x1="9" y1="31" x2="31" y2="9" />
      </g>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
