'use client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { clockTime } from '@/lib/format';
import { useRunCycle } from '@/lib/queries';
import type { EnvKey, RunnerStatus, Summary } from '@/lib/types';

export function EnvToggle({
  value,
  options,
  onChange,
}: {
  value: EnvKey;
  options: EnvKey[];
  onChange: (e: EnvKey) => void;
}) {
  return (
    <div role="group" aria-label="Environment" className="inline-flex rounded-[10px] border border-line bg-sunk p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => o !== value && onChange(o)}
          className={`min-h-[36px] min-w-[64px] rounded-ctl px-4 font-mono text-meta font-semibold ${
            o === value ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function StatBlock({ value, label, alarm }: { value: number | string; label: string; alarm?: boolean }) {
  return (
    <div>
      <div className={`text-[26px] font-semibold leading-none ${alarm ? 'text-bad' : 'text-ink'}`}>{value}</div>
      <div className="mt-1 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}

export function RunProgress({
  status,
  env,
  finished,
}: {
  status: RunnerStatus | undefined;
  env: EnvKey;
  finished: { at: Date; total: number } | null;
}) {
  let text = 'Runs each API one after another';
  if (status?.running) {
    const n = Math.min(status.done + 1, status.total);
    const where = status.environment && status.environment !== env ? `${status.environment}: ` : '';
    text = `Checking ${where}${n} of ${status.total}${status.currentApi ? `: ${status.currentApi.name}` : ''}`;
  } else if (finished) {
    text = `Checked ${finished.total} ${finished.total === 1 ? 'API' : 'APIs'} at ${clockTime(finished.at)}`;
  }
  return (
    <p aria-live="polite" className="text-[12.5px] text-muted" data-testid="run-progress">
      {text}
    </p>
  );
}

export function RunCycleButton({ env, running }: { env: EnvKey; running: boolean }) {
  const run = useRunCycle();
  const toast = useToast();
  return (
    <Button
      variant="primary"
      className="w-full desk:w-auto"
      disabled={running || run.isPending}
      onClick={() => run.mutate(env, { onError: (e) => toast({ title: e.message, tone: 'bad' }) })}
    >
      {running ? 'Checking…' : 'Run a check cycle'}
    </Button>
  );
}

export function PlatformCard({
  summary,
  env,
  envOptions,
  onEnvChange,
  runner,
  finished,
}: {
  summary: Summary | undefined;
  env: EnvKey;
  envOptions: EnvKey[];
  onEnvChange: (e: EnvKey) => void;
  runner: RunnerStatus | undefined;
  finished: { at: Date; total: number } | null;
}) {
  const c = summary?.counts;
  return (
    <section aria-label="Platform" className="rounded-dialog border border-line bg-panel p-5 desk:p-6">
      <div className="flex flex-col gap-5 desk:flex-row desk:items-start desk:justify-between">
        <div className="flex flex-col gap-5 desk:flex-row desk:items-start desk:gap-8">
          <div>
            <div className="font-mono text-[44px] font-semibold leading-none">{summary?.platform ?? 'whr'}</div>
            <div className="mt-2 text-meta text-muted">{summary?.environment.baseUrl ?? ''}</div>
          </div>
          <div className="flex flex-col gap-4">
            <EnvToggle value={env} options={envOptions} onChange={onEnvChange} />
            <div className="flex gap-7">
              <StatBlock value={c?.apis ?? '–'} label="APIs" />
              <StatBlock value={c?.failing ?? '–'} label="Failing now" alarm={!!c?.failing} />
              <StatBlock value={c?.alertsOpen ?? '–'} label="Alerts open" alarm={!!c?.alertsOpen} />
              <StatBlock value={c?.modules ?? '–'} label="Modules" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 desk:items-end">
          <RunCycleButton env={env} running={!!runner?.running} />
          <RunProgress status={runner} env={env} finished={finished} />
        </div>
      </div>
    </section>
  );
}
