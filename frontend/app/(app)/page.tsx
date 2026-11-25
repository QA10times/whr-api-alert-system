'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertEmailDialog } from '@/components/alerts/AlertEmailDialog';
import { AlertsTable } from '@/components/monitor/AlertsTable';
import { ApiCard } from '@/components/monitor/ApiCard';
import { PlatformCard } from '@/components/monitor/PlatformCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { FAILURE_THRESHOLD } from '@/lib/format';
import { useAlerts, useEnv, useRunnerWatcher, useSummary } from '@/lib/queries';
import type { AlertRow, EnvKey, SummaryModule } from '@/lib/types';

/** Toast for every alert row that appears after the first load (section 13). */
function useAlertToasts(env: EnvKey, rows: AlertRow[] | undefined, onView: (id: number) => void) {
  const toast = useToast();
  const seen = useRef<{ env: EnvKey; max: number } | null>(null);
  useEffect(() => {
    if (!rows) return;
    const max = rows.reduce((m, r) => Math.max(m, r.id), 0);
    if (!seen.current || seen.current.env !== env) {
      seen.current = { env, max };
      return;
    }
    const fresh = rows.filter((r) => r.id > seen.current!.max).reverse();
    seen.current.max = Math.max(seen.current.max, max);
    for (const a of fresh) {
      if (a.kind === 'RECOVERY') {
        toast({ title: a.groupName ? `${a.apiName} recovered. Email sent to ${a.groupName}.` : `${a.apiName} recovered.` });
      } else if (a.groupName) {
        toast({
          title: `${a.apiName} failed ${FAILURE_THRESHOLD} times. Alert emailed to ${a.groupName} (${a.recipients.length}).`,
          tone: 'bad',
          action: { label: 'View email', onClick: () => onView(a.id) },
          duration: 10_000,
        });
      } else {
        toast({ title: `${a.apiName} failed ${FAILURE_THRESHOLD} times, but its module has no email group.`, tone: 'bad' });
      }
    }
  }, [rows, env, toast, onView]);
}

function ModuleGroup({ module, failingOnly, checkingId }: { module: SummaryModule; failingOnly: boolean; checkingId: number | null }) {
  const apis = failingOnly ? module.apis.filter((a) => a.state !== 'OK') : module.apis;
  if (!apis.length) return null;
  return (
    <section aria-labelledby={`m-${module.id}`} className="flex flex-col gap-3">
      <h2 id={`m-${module.id}`} className="flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold">
        {module.name}
        <span className="text-[12.5px] font-normal text-muted">
          Every {module.frequencyMinutes} min, {module.emailGroup ? `alerts to ${module.emailGroup.name}` : 'no group'}
          {!module.isActive && ' · Paused'}
        </span>
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px]">
        {apis.map((a) => (
          <ApiCard key={a.id} api={a} checking={checkingId === a.id} moduleActive={module.isActive} />
        ))}
      </div>
    </section>
  );
}

export default function MonitorPage() {
  const { env, setEnv, setParams, params, environments } = useEnv();
  const failingOnly = params.get('filter') === 'failing';
  const summary = useSummary(env);
  const alerts = useAlerts(env);
  const { runner, finished } = useRunnerWatcher();
  const [viewAlert, setViewAlert] = useState<number | null>(null);
  useAlertToasts(env, alerts.data, setViewAlert);

  const envOptions: EnvKey[] = environments.length ? environments.map((e) => e.key) : ['gtm', 'geo'];
  const checkingId = runner?.running ? (runner.currentApi?.id ?? null) : null;
  const modules = summary.data?.modules ?? [];
  const anyVisible = modules.some((m) => (failingOnly ? m.apis.some((a) => a.state !== 'OK') : m.apis.length > 0));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Monitor</h1>
      <PlatformCard
        summary={summary.data}
        env={env}
        envOptions={envOptions}
        onEnvChange={setEnv}
        runner={runner}
        finished={finished}
      />

      <div role="group" aria-label="Filter" className="flex gap-2">
        {[
          { label: 'All APIs', on: !failingOnly, value: null },
          { label: 'Failing only', on: failingOnly, value: 'failing' },
        ].map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={c.on}
            onClick={() => setParams({ filter: c.value })}
            className={`min-h-[36px] rounded-full border px-4 text-meta ${
              c.on ? 'border-ink bg-ink text-panel' : 'border-line bg-panel text-ink hover:bg-sunk'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {summary.isLoading && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60" />
          ))}
        </div>
      )}
      {summary.error && <ErrorState message={summary.error.message} onRetry={() => summary.refetch()} />}

      {summary.data && modules.length === 0 && (
        <EmptyState
          title={`No modules in ${env} yet.`}
          action={
            <Link
              href={`/modules?env=${env}&new=1`}
              className="inline-flex min-h-[40px] items-center rounded-ctl bg-accent px-4 text-meta font-semibold text-[rgb(var(--on-accent))]"
            >
              Create a module
            </Link>
          }
        />
      )}
      {summary.data && modules.length > 0 && failingOnly && !anyVisible &&<EmptyState title={`Every API in ${env} passed its last check.`} />}

      {modules.map((m) => (
        <ModuleGroup key={m.id} module={m} failingOnly={failingOnly} checkingId={checkingId} />
      ))}

      <AlertsTable rows={alerts.data} />
      <AlertEmailDialog alertId={viewAlert} open={viewAlert !== null} onOpenChange={(o) => !o && setViewAlert(null)} />
    </div>
  );
}
