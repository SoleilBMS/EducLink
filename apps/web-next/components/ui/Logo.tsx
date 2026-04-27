type Props = { className?: string; gradientId?: string };

export function LogoMark({ className = 'h-8 w-8', gradientId = 'el-logo-grad' }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M24 8 4 18l20 10 16-8v10a1.5 1.5 0 0 0 3 0V18z" fill={`url(#${gradientId})`} />
      <path
        d="M12 24v6c0 3 5.4 6 12 6s12-3 12-6v-6l-12 6z"
        fill={`url(#${gradientId})`}
        opacity=".85"
      />
      <circle cx="41.5" cy="29.5" r="2.2" fill="#7c3aed" />
    </svg>
  );
}

export function LogoWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-7 w-7" />
      <span className="text-brand-gradient font-extrabold tracking-tightest">EducLink</span>
    </span>
  );
}
