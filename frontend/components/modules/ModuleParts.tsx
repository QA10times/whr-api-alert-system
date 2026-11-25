'use client';
// ModuleList, ModuleSettings, ApisTable, RunNowButton
import { CopyCurlButton } from '@/components/curl/CopyCurlButton';
import { MethodChip, StatusBadge, TagChip } from '@/components/monitor/bits';
import { Button } from '@/components/ui/Button';
import { useNow } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { absoluteTime, AUTH_LABEL, MISSING_LABEL, plural, relativeTime, tableFrequency } from '@/lib/format';
import { useRunApi, useRunner } from '@/lib/queries';
import type { ApiRow, ModuleDetail, ModuleListItem } from '@/lib/types';

export function ModuleList({
  modules,
  selectedId,
  onSelect,
}: {
  modules: ModuleListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <ul aria-label="Modules" className="flex flex-col gap-2">
      {modules.map((m) => {
        const active = m.id === selectedId;
        return (
          <li key={m.id}>
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(m.id)}
              className={`card w-full px-4 py-3 text-left ${active ? 'border-accent shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'hover:bg-sunk'}`}
            >
              <span className="block text-[15px] font-semibold">{m.name}</span>
              <span className="text-[12.5px] text-muted">
                {plural(m.apiCount, 'API')}, every {m.frequencyMinutes} min
                {!m.isActive && ' · Paused'}
                {m.failingCount > 0 && <span className="font-semibold text-bad"> · {m.failingCount} failing</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function authText(m: ModuleDetail) {
  const label = AUTH_LABEL[m.auth.method] ?? m.auth.method;
  if (m.auth.method === 'NONE') return label;
  if (m.auth.missing.length) return `${label} (${m.auth.missing.map((x) => MISSING_LABEL[x] ?? x).join(', ')} missing)`;
  return `${label} (set)`;
}

export function ModuleSettings({ module: m }: { module: ModuleDetail }) {
  const rows: [string, React.ReactNode, boolean?][] = [
    ['Base URL', m.baseUrl, true],
    ['Auth', authText(m)],
    ['Check every', `${m.frequencyMinutes} min`],
    ['Alert group', m.emailGroup ? `${m.emailGroup.name} (${m.emailGroup.memberCount})` : 'None — alerts won’t send'],
    ['Alert rule', '5 failed checks in a row'],
    ['Status', m.isActive ? 'Active' : 'Paused'],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-card bg-sunk p-4 sm:grid-cols-3">
      {rows.map(([k, v, mono]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12.5px] text-muted">{k}</dt>
          <dd className={`break-words ${mono ? 'font-mono text-[13px]' : 'text-meta'} ${k === 'Alert group' && !m.emailGroup ? 'text-bad' : ''}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RunNowButton({ apiId, apiName }: { apiId: number; apiName: string }) {
  const run = useRunApi();
  const running = useRunner().data?.running ?? false;
  const toast = useToast();
  return (
    <Button
      size="sm"
      disabled={running}
      loading={run.isPending}
      aria-label={`Run ${apiName} now`}
      onClick={() =>
        run.mutate(apiId, {
          onSuccess: () => toast({ title: `Checking ${apiName}.` }),
          onError: (e) => toast({ title: e.message, tone: 'bad' }),
        })
      }
    >
      Run now
    </Button>
  );
}

export function ApisTable({ apis, onEdit }: { apis: ApiRow[]; onEdit: (id: number) => void }) {
  const now = useNow();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-meta">
        <thead className="text-[12.5px] text-muted">
          <tr className="border-b border-line">
            {['API', 'Method', 'Endpoint', 'Tag', 'Pass checks', 'Every', 'Last status', 'Last run'].map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
            <th className="py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apis.map((a) => {
            const ran = a.lastRunAt !== null;
            return (
              <tr key={a.id} className={`border-b border-line last:border-0 ${a.isActive ? '' : 'opacity-60'}`}>
                <td className="py-2.5 pr-3 font-medium">{a.name}</td>
                <td className="py-2.5 pr-3">
                  <MethodChip method={a.method} />
                </td>
                <td className="max-w-[260px] py-2.5 pr-3 font-mono text-[12.5px]">
                  {a.baseUrlOverride && <span className="block break-all text-muted">{a.baseUrlOverride}</span>}
                  <span className="break-all">{a.endpoint}</span>
                </td>
                <td className="py-2.5 pr-3">{a.tag ? <TagChip tag={a.tag} /> : '—'}</td>
                <td className="py-2.5 pr-3 font-mono text-[12px] text-muted">
                  {a.passRule.countKey && <span className="block">{a.passRule.countKey} &gt; 0</span>}
                  {a.passRule.dataKey && <span className="block">{a.passRule.dataKey}[] &gt; 1</span>}
                  {!a.passRule.countKey && !a.passRule.dataKey && 'status only'}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3">{tableFrequency(a.frequencyMinutes, a.frequencySource)}</td>
                <td className="py-2.5 pr-3">
                  <StatusBadge code={a.lastStatusCode} passed={a.lastPassed} ran={ran} />
                  {ran && a.lastPassed === false && a.lastStatusCode === 200 && (
                    <span className="mt-1 block text-[12px] text-bad">{a.lastFailureReason}</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3" title={absoluteTime(a.lastRunAt)}>
                  {relativeTime(a.lastRunAt, now)}
                </td>
                <td className="py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" onClick={() => onEdit(a.id)} aria-label={`Edit ${a.name}`}>
                      Edit
                    </Button>
                    <RunNowButton apiId={a.id} apiName={a.name} />
                    <CopyCurlButton apiId={a.id} apiName={a.name} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
