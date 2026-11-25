'use client';
import { StatusBadge } from '@/components/monitor/bits';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { absoluteTime, failureText } from '@/lib/format';
import { useRuns } from '@/lib/queries';

export function RunHistoryTable({ apiId }: { apiId: number }) {
  const runs = useRuns(apiId);
  return (
    <section aria-labelledby="runs-h" className="card p-5">
      <h2 id="runs-h" className="mb-3 text-[17px] font-semibold">
        Run history
      </h2>
      {runs.isLoading && <Skeleton className="h-40" />}
      {runs.error && <ErrorState message={runs.error.message} onRetry={() => runs.refetch()} />}
      {runs.data && runs.data.length === 0 && <p className="text-body text-muted">No runs yet. This API runs on the next cycle.</p>}
      {runs.data && runs.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-meta">
            <thead className="text-[12.5px] text-muted">
              <tr className="border-b border-line">
                {['Time', 'Status', 'Result', 'Count', 'Items', 'Latency (ms)'].map((h) => (
                  <th key={h} className="py-2 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${r.passed ? '' : 'bg-bad-bg'}`}>
                  <td className="whitespace-nowrap py-2 pl-2 pr-3">{absoluteTime(r.startedAt)}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge code={r.statusCode} passed={r.passed} ran />
                  </td>
                  <td className={`py-2 pr-3 ${r.passed ? '' : 'text-bad'}`}>
                    {r.passed ? 'Passed' : failureText(r.statusCode, r.failureReason)}
                  </td>
                  <td className="py-2 pr-3 font-mono">{r.countValue ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono">{r.itemCount ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono">{r.latencyMs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
