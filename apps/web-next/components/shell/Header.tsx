type Props = {
  schoolLabel: string;
  title: string;
  userName: string;
  userEmail: string;
  roleLabel: string;
};

export function Header({ schoolLabel, title, userName, userEmail, roleLabel }: Props) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-line bg-white px-6 py-5 shadow-soft">
      <div>
        <p className="m-0 text-xs font-semibold uppercase tracking-widest text-ink-muted">
          {schoolLabel}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <p className="m-0 text-sm font-semibold text-ink">{userName}</p>
        <p className="m-0 text-xs text-ink-muted">{userEmail}</p>
        <span className="badge mt-1">{roleLabel}</span>
      </div>
    </header>
  );
}
