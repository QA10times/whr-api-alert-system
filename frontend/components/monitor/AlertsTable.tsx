'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertEmailDialog } from '@/components/alerts/AlertEmailDialog';
import { Pill, useNow } from '@/components/ui/misc';
import { absoluteTime, alertPill, relativeTime } from '@/lib/format';
import type { AlertRow } from '@/lib/types';
import { TagChip } from './bits';

export function AlertsTable({ rows, title = 'Recent alerts' }: { rows: AlertRow[] | undefined; title?: string }) {
  const now = useNow();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section aria-labelledby="alerts-h" className="card p-5">
      <h2 id="alerts-h" className="mb-3 text-[17px] font-semibold">
        {title}
      </h2>
      {rows && rows.length === 0 ? (
        <p className="text-body text-muted">No alerts yet. An email goes out when an API fails its checks on 5 hits in a row.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-meta">
            <thead className="text-[12.5px] text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Observed</th>
                <th className="py-2 pr-3 font-medium">API</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Tag</th>
                <th className="py-2 pr-3 font-medium">Sent to</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3" title={absoluteTime(a.observedAt)}>
                    {relativeTime(a.observedAt, now)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/apis/${a.apiId}`} className="text-accent underline-offset-2 hover:underline">
                      {a.apiName}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3">
                    {a.kind === 'RECOVERY' ? <Pill tone="accent">Recovered</Pill> : <Pill tone="bad">{alertPill(a.statusCode, a.failureReason)}</Pill>}
                  </td>
                  <td className="py-2.5 pr-3">{a.tag ? <TagChip tag={a.tag} /> : '—'}</td>
                  <td className="py-2.5 pr-3">
                    <span className="mr-2">{a.groupName ? `${a.groupName} (${a.recipients.length})` : 'No group'}</span>
                    {a.status === 'FAILED' && <Pill tone="bad">Not delivered</Pill>}
                  </td>
                  <td className="py-2.5 text-right">
                    <button type="button" onClick={() => setOpen(a.id)} className="min-h-[36px] text-accent underline underline-offset-2">
                      View email
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AlertEmailDialog alertId={open} open={open !== null} onOpenChange={(o) => !o && setOpen(null)} />
    </section>
  );
}
