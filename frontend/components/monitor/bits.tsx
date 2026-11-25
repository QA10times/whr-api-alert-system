// Small presentational pieces of the API card: StatusBadge, HitStrip, FailureReason,
// PassRuleLine, TagChip, MethodChip. All pure.
import { clsx } from 'clsx';
import { failureText, hitLabel, passRuleText, statusLabel } from '@/lib/format';
import type { Hit, HttpMethod, Tag } from '@/lib/types';

/** Colour comes from `passed`, not from the code: a 200 that failed its checks is red. */
export function StatusBadge({ code, passed, ran }: { code: number | null; passed: boolean | null; ran: boolean }) {
  const tone = !ran ? 'bg-sunk text-muted border-line' : passed ? 'bg-ok-bg text-ok border-ok/30' : 'bg-bad-bg text-bad border-bad/30';
  return (
    <span
      data-testid="status-badge"
      data-tone={!ran ? 'idle' : passed ? 'ok' : 'bad'}
      className={clsx('rounded-ctl border px-2 py-0.5 font-mono text-[15px] font-semibold leading-tight', tone)}
    >
      {statusLabel(code, ran)}
    </span>
  );
}

export function MethodChip({ method }: { method: HttpMethod | string }) {
  return (
    <span className="rounded-[6px] border border-line px-1.5 py-px font-mono text-chip font-semibold text-muted">{method}</span>
  );
}

export function TagChip({ tag }: { tag: Tag | null }) {
  if (!tag) return null;
  return (
    <span className="inline-block max-w-full truncate rounded-[6px] bg-accent-soft px-1.5 py-px font-mono text-[12px] text-accent">
      {tag.key}: {tag.value}
    </span>
  );
}

export function FailureReason({ code, reason }: { code: number | null; reason: string | null }) {
  return <p className="text-meta font-medium text-bad">{failureText(code, reason)}</p>;
}

export function PassRuleLine({ countKey, dataKey }: { countKey: string | null; dataKey: string | null }) {
  return <p className="text-[12.5px] text-muted">{passRuleText(countKey, dataKey)}</p>;
}

function hitClass(h: Hit | null) {
  if (!h) return 'bg-idle';
  if (h.passed) return 'bg-ok';
  if (h.code === 200) return 'hit-striped';
  return 'bg-bad';
}

/** Five squares, oldest left, padded on the left with empty squares. */
export function HitStrip({ hits, fails, threshold, failing }: { hits: Hit[]; fails: number; threshold: number; failing: boolean }) {
  const last = hits.slice(-5);
  const padded: (Hit | null)[] = [...Array(5 - last.length).fill(null), ...last];
  const label = last.length ? `Last ${last.length} hits: ${last.map(hitLabel).join(', ')}` : 'No hits yet';
  return (
    <div className="flex items-center gap-2.5">
      <div role="img" aria-label={label} className="flex gap-1">
        {padded.map((h, i) => (
          <span key={i} data-hit={h ? (h.passed ? 'ok' : h.code === 200 ? 'check' : 'bad') : 'idle'} className={clsx('h-5 w-5 rounded-[4px]', hitClass(h))} />
        ))}
      </div>
      <span className="text-[12.5px] text-muted">{failing ? `${fails} of ${threshold} failed` : 'last 5 hits'}</span>
    </div>
  );
}
