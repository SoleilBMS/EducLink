'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoWordmark } from '@/components/ui/Logo';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  section: 'core' | 'users' | 'ops';
  accent?: 'blue' | 'green' | 'purple' | 'pink' | 'amber' | 'teal';
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '◈', section: 'core', accent: 'blue' },
  { href: '/ai-assistant', label: 'Assistant IA', icon: '✦', section: 'core', accent: 'purple' },
  { href: '/students', label: 'Élèves', icon: '○', section: 'users', accent: 'teal' },
  { href: '/teacher', label: 'Espace enseignant', icon: '◧', section: 'users', accent: 'green' },
  { href: '/parent', label: 'Portail parents', icon: '◎', section: 'users', accent: 'pink' },
  { href: '/attendance', label: 'Présences', icon: '⊖', section: 'ops', accent: 'blue' },
  { href: '/grades', label: 'Notes & bulletins', icon: '☆', section: 'ops', accent: 'amber' },
  { href: '/messaging', label: 'Messagerie', icon: '✉', section: 'ops', accent: 'purple' },
  { href: '/finance', label: 'Finance', icon: '◍', section: 'ops', accent: 'green' }
];

const SECTIONS = [
  { id: 'core', label: 'Pilotage' },
  { id: 'users', label: 'Expériences' },
  { id: 'ops', label: 'Opérations' }
] as const;

const ACCENT_BG: Record<NonNullable<NavItem['accent']>, string> = {
  blue: 'bg-brand-blue/15 text-brand-blue',
  green: 'bg-brand-green/15 text-brand-green',
  purple: 'bg-brand-purple/15 text-brand-purple',
  pink: 'bg-brand-pink/15 text-brand-pink',
  amber: 'bg-brand-amber/15 text-brand-amber',
  teal: 'bg-brand-teal/15 text-brand-teal'
};

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface/95 px-4 py-5 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="relative overflow-hidden rounded-2xl border border-brand-blue/15 bg-brand-soft p-4">
        <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-purple/20 blur-2xl" />
        <span className="pointer-events-none absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-brand-green/20 blur-2xl" />
        <div className="relative">
          <LogoWordmark className="text-lg" withTagline />
        </div>
      </div>

      <nav className="mt-5 grid gap-5 overflow-y-auto pb-4">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-widest text-ink-soft">
              {section.label}
            </p>
            <div className="grid gap-1">
              {NAV.filter((item) => item.section === section.id).map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const accentClass = ACCENT_BG[item.accent ?? 'blue'];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-surface-alt text-ink shadow-soft'
                        : 'text-ink-muted hover:bg-surface-alt hover:text-ink'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-brand-gradient" />
                    )}
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg text-sm transition-all ${
                        isActive
                          ? accentClass
                          : 'bg-surface-alt text-ink-soft group-hover:bg-surface'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-surface-alt p-3 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="dot-pulse" />
          <p className="m-0 font-semibold text-ink">Statut plateforme</p>
        </div>
        <p className="m-0 mt-1.5 leading-relaxed">
          99.95% disponibilité · Dernière sync IA il y a 2 min.
        </p>
      </div>
    </aside>
  );
}
