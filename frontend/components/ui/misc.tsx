'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

/** Two-click destructive action; resets after 4 s. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  ...rest
}: { label: string; confirmLabel: string; onConfirm: () => void } & Omit<ButtonProps, 'onClick'>) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      variant="danger"
      {...rest}
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6 text-body text-muted">
      <p>{title}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 border-bad bg-bad-bg p-5 text-body text-bad">
      <p>{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-card bg-line/60 ${className}`} />;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="field-error">
      {message}
    </p>
  );
}

export function Pill({ tone, children }: { tone: 'bad' | 'ok' | 'accent' | 'warn'; children: ReactNode }) {
  const cls = {
    bad: 'bg-bad-bg text-bad',
    ok: 'bg-ok-bg text-ok',
    accent: 'bg-accent-soft text-accent',
    warn: 'bg-warn-bg text-warn',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${cls}`}>{children}</span>;
}

/** Re-renders every 30 s so relative times stay fresh. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
