'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark } from '@/components/ui/Logo';

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: '◇' },
  { href: '/students', label: 'Élèves', icon: '○' },
  { href: '/classes', label: 'Classes', icon: '◧' },
  { href: '/attendance', label: 'Absences', icon: '⊖' },
  { href: '/grades', label: 'Notes', icon: '☆' },
  { href: '/finance', label: 'Finance', icon: '◈' },
  { href: '/messaging', label: 'Messagerie', icon: '✉' }
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-line bg-white px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="rounded-2xl border border-brand-blue/10 bg-brand-soft p-4">
        <div className="flex items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <p className="m-0 text-lg font-extrabold tracking-tightest text-brand-gradient">
            EducLink
          </p>
        </div>
        <p className="mt-2 text-xs leading-snug text-ink-muted">
          L’école connectée, intelligente et simplifiée
        </p>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-blue/10 text-brand-blue'
                  : 'text-ink-muted hover:bg-surface-alt hover:text-ink'
              }`}
            >
              {isActive && (
                <span className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-brand-gradient" />
              )}
              <span className="w-4 text-center text-base opacity-70">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="h-1.5 rounded-full bg-brand-gradient opacity-85" />
        <Link
          href="/logout"
          className="text-center text-xs font-medium text-ink-muted hover:text-brand-blue"
        >
          Se déconnecter
        </Link>
      </div>
    </aside>
  );
}
