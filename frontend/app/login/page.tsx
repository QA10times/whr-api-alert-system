import { Suspense } from 'react';
import { Mark } from '@/components/shell/Mark';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="card w-full max-w-[380px] p-7 shadow-sm">
        <Mark size={22} />
        <h1 className="mt-4 text-[22px] font-semibold">Sign in to WHR API monitor</h1>
        <p className="mt-1 text-meta text-muted">Uptime checks and failure alerts for gtm and geo.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
