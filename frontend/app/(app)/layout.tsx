import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SideNav } from '@/components/shell/SideNav';

/** AppShell: SideNav + <main>. Requires a session (middleware also enforces this). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!cookies().has('whr_session')) redirect('/login');
  return (
    <div className="desk:flex">
      <Suspense>
        <SideNav />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-5 desk:px-8 desk:py-7">
        <div className="mx-auto max-w-content">
          <Suspense>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
