'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoWordmark } from '@/components/ui/Logo';

type NavItem = { href: string; label: string; icon: string; section: 'core' | 'users' | 'ops' };

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '◈', section: 'core' },
  { href: '/ai-assistant', label: 'Assistant IA', icon: '✦', section: 'core' },
  { href: '/students', label: 'Élèves', icon: '○', section: 'users' },
  { href: '/teacher', label: 'Espace enseignant', icon: '◧', section: 'users' },
  { href: '/parent', label: 'Portail parents', icon: '◎', section: 'users' },
  { href: '/attendance', label: 'Présences', icon: '⊖', section: 'ops' },
  { href: '/grades', label: 'Notes & bulletins', icon: '☆', section: 'ops' },
  { href: '/messaging', label: 'Messagerie', icon: '✉', section: 'ops' },
  { href: '/finance', label: 'Finance', icon: '◍', section: 'ops' }
];

const SECTIONS = [
  { id: 'core', label: 'Pilotage' },
  { id: 'users', label: 'Expériences' },
  { id: 'ops', label: 'Opérations' }
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-white/95 px-4 py-5 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="rounded-2xl border border-brand-blue/10 bg-brand-soft p-4">
        <LogoWordmark className="text-lg" />
        <p className="mt-2 text-xs leading-snug text-ink-muted">
          ERP SaaS pour écoles privées — moderne, intelligent, accessible.
        </p>
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
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-surface-alt p-3 text-xs text-ink-muted">
        <p className="m-0 font-semibold text-ink">Status plateforme</p>
        <p className="m-0 mt-1">99.95% disponibilité · Dernière sync IA: il y a 2 min.</p>
      </div>
    </aside>
  );
}
