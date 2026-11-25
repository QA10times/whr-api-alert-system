'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, LayoutGrid, Mail } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useEnv, useSummary } from '@/lib/queries';
import { Mark } from './Mark';

function useUserEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)whr_user=([^;]+)/);
    setEmail(m ? decodeURIComponent(m[1]) : null);
  }, []);
  return email;
}

export function SideNav() {
  const pathname = usePathname();
  const { env } = useEnv();
  const { data: summary } = useSummary(env);
  const qc = useQueryClient();
  const email = useUserEmail();
  const alertsOpen = summary?.counts.alertsOpen ?? 0;

  const items = [
    { href: `/?env=${env}`, match: (p: string) => p === '/' || p.startsWith('/apis'), label: 'Monitor', Icon: Activity, badge: alertsOpen },
    { href: `/modules?env=${env}`, match: (p: string) => p.startsWith('/modules'), label: 'Modules', Icon: LayoutGrid, badge: 0 },
    { href: '/email-groups', match: (p: string) => p.startsWith('/email-groups'), label: 'Email groups', Icon: Mail, badge: 0 },
  ];

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.assign('/login');
  }

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-30 flex items-center gap-1 border-b border-line bg-panel px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] desk:h-dvh desk:w-nav desk:flex-col desk:items-stretch desk:gap-0 desk:border-b-0 desk:border-r desk:p-4"
    >
      <div className="hidden items-center gap-2 px-2 pb-6 pt-1 desk:flex">
        <Mark size={18} />
        <span className="text-meta font-semibold">WHR monitor</span>
      </div>
      <ul className="flex flex-1 items-center gap-1 overflow-x-auto desk:flex-none desk:flex-col desk:items-stretch">
        {items.map(({ href, match, label, Icon, badge }) => {
          const active = match(pathname);
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[40px] items-center gap-2.5 whitespace-nowrap rounded-ctl px-3 text-meta ${
                  active ? 'bg-accent-soft font-semibold text-ink' : 'text-muted hover:bg-sunk hover:text-ink'
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
                {badge > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white">
                    <span className="sr-only">, </span>
                    {badge}
                    <span className="sr-only"> open {badge === 1 ? 'alert' : 'alerts'}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="desk:mt-auto desk:border-t desk:border-line desk:pt-4">
        {email && <p className="hidden truncate px-2 text-hint text-muted desk:block">{email}</p>}
        <button
          type="button"
          onClick={signOut}
          className="min-h-[40px] whitespace-nowrap px-2 text-meta text-accent underline underline-offset-2"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
