type Props = { className?: string; gradientId?: string };

/**
 * EducLink mark — graduation cap (mortarboard) with tassel.
 * Gradient: green → blue → purple, matching the official brand palette.
 */
export function LogoMark({ className = 'h-8 w-8', gradientId = 'el-logo-grad' }: Props) {
  const tasselGradId = `${gradientId}-tassel`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="EducLink"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={tasselGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>

      {/* Mortarboard top (diamond plate) */}
      <path
        d="M32 10 L60 22 L32 34 L4 22 Z"
        fill={`url(#${gradientId})`}
      />

      {/* Cap base (under-band) */}
      <path
        d="M14 28 L14 36 C14 41 22 45 32 45 C42 45 50 41 50 36 L50 28 L32 36 Z"
        fill={`url(#${gradientId})`}
        opacity="0.88"
      />

      {/* Tassel cord */}
      <path
        d="M55 22 L55 38"
        stroke={`url(#${tasselGradId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Tassel head */}
      <circle cx="55" cy="40.5" r="3" fill="#7c3aed" />

      {/* Tassel fringe */}
      <path
        d="M52.5 42.5 L52 47 M55 43.5 L55 48 M57.5 42.5 L58 47"
        stroke="#7c3aed"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  withTagline?: boolean;
  taglineClassName?: string;
};

export function LogoWordmark({
  className = '',
  withTagline = false,
  taglineClassName = ''
}: WordmarkProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className="inline-flex flex-col leading-none">
        <span className="text-brand-gradient font-extrabold tracking-tightest">EducLink</span>
        {withTagline && (
          <span
            className={`mt-1 text-[11px] font-medium text-ink-muted leading-snug ${taglineClassName}`}
          >
            L’école connectée, intelligente et simplifiée
          </span>
        )}
      </span>
    </span>
  );
}
