'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RunHistoryTable } from '@/components/apis/RunHistoryTable';
import { CopyCurlButton } from '@/components/curl/CopyCurlButton';
import { ApiFormDialog } from '@/components/modules/ApiFormDialog';
import { RunNowButton } from '@/components/modules/ModuleParts';
import { AlertsTable } from '@/components/monitor/AlertsTable';
import { ApiCard } from '@/components/monitor/ApiCard';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { AUTH_LABEL } from '@/lib/format';
import { useAlerts, useApiDetail, useRunner } from '@/lib/queries';

/** Target of the alert email's "Open in dashboard" link. Next 14.2: params is a plain object. */
export default function ApiDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const router = useRouter();
  const detail = useApiDetail(Number.isFinite(id) ? id : null);
  const runner = useRunner().data;
  const a = detail.data;
  const alerts = useAlerts(a?.environment ?? 'gtm');
  const [editing, setEditing] = useState(false);

  if (!Number.isFinite(id)) return <ErrorState message="That API link isn’t valid." />;
  if (detail.isLoading) return <Skeleton className="h-80" />;
  if (detail.error || !a) return <ErrorState message={detail.error?.message ?? 'API not found.'} onRetry={() => detail.refetch()} />;

  const authMethod = a.auth.method === 'INHERIT' ? `${AUTH_LABEL[a.moduleAuthMethod]} (module)` : AUTH_LABEL[a.auth.method];
  const freq = `Every ${a.frequencyMinutes} min${a.frequencySource === 'module' ? ' (module)' : ' (API)'}`;

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-meta text-muted">
        <Link href={`/?env=${a.environment}`} className="text-accent hover:underline">
          Monitor
        </Link>{' '}
        /{' '}
        <Link href={`/modules?env=${a.environment}&module=${a.moduleId}`} className="text-accent hover:underline">
          {a.moduleName}
        </Link>
      </nav>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[26px] font-semibold">{a.name}</h1>
        <Button onClick={() => setEditing(true)}>Edit</Button>
        <RunNowButton apiId={a.id} apiName={a.name} />
        <CopyCurlButton apiId={a.id} apiName={a.name} size="md" />
      </header>

      <div className="grid grid-cols-1 gap-4 desk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ApiCard api={a} checking={!!runner?.running && runner.currentApi?.id === a.id} wide />
        <dl className="card grid content-start gap-3 p-5 text-meta">
          {[
            ['Module', <Link key="m" href={`/modules?env=${a.environment}&module=${a.moduleId}`} className="text-accent hover:underline">{a.moduleName} ({a.environment})</Link>],
            ['Request', <span key="r" className="break-all font-mono text-[13px]">{a.method} {a.effectiveBaseUrl}{a.endpoint}</span>],
            ['Base URL', <span key="b" className="break-all font-mono text-[13px]">{a.effectiveBaseUrl}{a.baseUrlOverride ? ' (API)' : ' (module)'}</span>],
            ['Auth', authMethod],
            ['Check every', freq],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[12.5px] text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <RunHistoryTable apiId={a.id} />
      <AlertsTable title="Alerts for this API" rows={alerts.data?.filter((r) => r.apiId === a.id).slice(0, 10)} />

      {editing && (
        <ApiFormDialog
          mode="edit"
          moduleId={a.moduleId}
          apiId={a.id}
          open
          onOpenChange={(o) => !o && setEditing(false)}
          onDeleted={() => router.push(`/modules?env=${a.environment}&module=${a.moduleId}`)}
        />
      )}
    </div>
  );
}
