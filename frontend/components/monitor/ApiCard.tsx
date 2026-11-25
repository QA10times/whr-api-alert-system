'use client';
import { clsx } from 'clsx';
import Link from 'next/link';
import { CopyCurlButton } from '@/components/curl/CopyCurlButton';
import { useNow } from '@/components/ui/misc';
import { absoluteTime, frequencyLabel, relativeTime } from '@/lib/format';
import type { ApiCardData } from '@/lib/types';
import { FailureReason, HitStrip, MethodChip, PassRuleLine, StatusBadge, TagChip } from './bits';

export function cardVisualState(api: ApiCardData, moduleActive = true) {
  const paused = !api.isActive || !moduleActive;
  const ran = api.lastRunAt !== null;
  return { paused, ran, failing: api.state === 'FAILING', alerted: api.state === 'ALERTED' };
}

export function ApiCard({
  api,
  checking,
  moduleActive = true,
  wide = false,
}: {
  api: ApiCardData;
  checking: boolean;
  moduleActive?: boolean;
  wide?: boolean;
}) {
  const now = useNow();
  const { paused, ran, failing, alerted } = cardVisualState(api, moduleActive);
  const lastFailed = ran && api.lastPassed === false;

  return (
    <article
      aria-label={api.name}
      data-state={paused ? 'paused' : !ran ? 'never' : api.state.toLowerCase()}
      data-checking={checking || undefined}
      className={clsx(
        'card relative flex flex-col gap-2.5 p-4',
        failing && 'border-warn',
        alerted && 'border-bad shadow-[inset_3px_0_0_rgb(var(--bad))]',
        paused && 'opacity-60',
        checking && 'animate-checking outline outline-2 outline-offset-0 outline-accent',
        wide && 'p-5',
      )}
    >
      <header className="flex items-start gap-2">
        <MethodChip method={api.method} />
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
          <Link href={`/apis/${api.id}`} className="hover:underline">
            {api.name}
          </Link>
        </h3>
        <StatusBadge code={api.lastStatusCode} passed={api.lastPassed} ran={ran} />
      </header>
      <p className="break-all font-mono text-[12.5px] text-muted" title={api.endpoint}>
        {api.endpoint}
      </p>
      {lastFailed && <FailureReason code={api.lastStatusCode} reason={api.lastFailureReason} />}
      <PassRuleLine countKey={api.passRule.countKey} dataKey={api.passRule.dataKey} />
      <HitStrip
        hits={api.lastHits}
        fails={api.consecutiveFailures}
        threshold={api.failureThreshold}
        failing={api.state !== 'OK'}
      />
      <footer className="flex flex-col gap-2 border-t border-line pt-2.5 text-[12.5px] text-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span title={absoluteTime(api.lastRunAt)}>Last run {relativeTime(api.lastRunAt, now)}</span>
          <span>{frequencyLabel(api.frequencyMinutes, api.frequencySource)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TagChip tag={api.tag} />
          {failing && <span className="font-semibold text-warn">Failing</span>}
          {alerted && <span className="font-semibold text-bad">Alert sent</span>}
          {paused && <span className="font-semibold">Paused</span>}
        </div>
        <div>
          <CopyCurlButton apiId={api.id} apiName={api.name} size="sm" />
        </div>
      </footer>
    </article>
  );
}
