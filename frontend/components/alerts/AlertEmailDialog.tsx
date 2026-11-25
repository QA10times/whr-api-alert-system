'use client';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { absoluteTime } from '@/lib/format';
import { useAlert } from '@/lib/queries';

/** Renders the stored copy from GET /alerts/:id as text — never as HTML. */
export function AlertEmailDialog({
  alertId,
  open,
  onOpenChange,
}: {
  alertId: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: a, isLoading, error, refetch } = useAlert(open ? alertId : null);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Alert email preview"
      wide
      footer={
        <Button variant="primary" className="ml-auto" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      {isLoading && <Skeleton className="h-64" />}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
      {a && (
        <div className="overflow-hidden rounded-card border border-line">
          <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 bg-sunk px-4 py-3 text-meta">
            <dt className="text-muted">To</dt>
            <dd className="break-all">{a.recipients.length ? a.recipients.join(', ') : '—'}</dd>
            <dt className="text-muted">Group</dt>
            <dd>{a.groupName ?? 'No group'}</dd>
            <dt className="text-muted">Observed</dt>
            <dd>{absoluteTime(a.observedAt)}</dd>
            <dt className="text-muted">Delivery</dt>
            <dd className={a.status === 'FAILED' ? 'font-semibold text-bad' : ''}>
              {a.status === 'SENT' ? 'Sent' : a.status === 'PENDING' ? 'Pending' : 'Not delivered'}
            </dd>
          </dl>
          <div className="border-t border-line px-4 py-3">
            <p className="text-body font-semibold">{a.subject}</p>
          </div>
          <pre className="whitespace-pre-wrap break-words border-t border-line px-4 py-3 font-sans text-meta leading-relaxed">
            {a.bodyText}
          </pre>
        </div>
      )}
    </Dialog>
  );
}
