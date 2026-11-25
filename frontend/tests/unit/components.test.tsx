import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyCurlButton } from '@/components/curl/CopyCurlButton';
import { ApiCard } from '@/components/monitor/ApiCard';
import { ToastProvider } from '@/components/ui/Toast';
import type { ApiCardData } from '@/lib/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/clipboard', () => ({ copyFromPromise: vi.fn() }));
import { copyFromPromise } from '@/lib/clipboard';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const base: ApiCardData = {
  id: 1,
  name: 'Event search',
  method: 'GET',
  endpoint: '/api/v1/events/search?q=saas',
  tag: { key: 'owner', value: 'search-team' },
  passRule: { countKey: 'count', dataKey: 'data' },
  frequencyMinutes: 5,
  frequencySource: 'module',
  isActive: true,
  lastStatusCode: 200,
  lastPassed: true,
  lastFailureReason: null,
  lastRunAt: new Date().toISOString(),
  lastHits: Array(5).fill({ code: 200, passed: true, reason: null }),
  consecutiveFailures: 0,
  failureThreshold: 5,
  state: 'OK',
};

describe('ApiCard states', () => {
  it('never run: grey dash badge, empty strip', () => {
    wrap(<ApiCard api={{ ...base, lastRunAt: null, lastStatusCode: null, lastPassed: null, lastHits: [] }} checking={false} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('—');
    expect(screen.getByTestId('status-badge').dataset.tone).toBe('idle');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'No hits yet');
    expect(screen.getByText('Last run never')).toBeInTheDocument();
  });
  it('passing: green badge, "last 5 hits"', () => {
    wrap(<ApiCard api={base} checking={false} />);
    expect(screen.getByTestId('status-badge').dataset.tone).toBe('ok');
    expect(screen.getByText('last 5 hits')).toBeInTheDocument();
    expect(screen.getByText('Passes on status 200, count > 0, data[] > 1 object')).toBeInTheDocument();
  });
  it('failing: 200 that failed is red with reason and note', () => {
    const hits = [
      { code: 200, passed: true, reason: null },
      { code: 200, passed: true, reason: null },
      { code: 200, passed: false, reason: 'count = 0' },
      { code: 503, passed: false, reason: 'HTTP 503' },
      { code: 200, passed: false, reason: 'count = 0' },
    ];
    wrap(
      <ApiCard
        api={{ ...base, lastPassed: false, lastFailureReason: 'count = 0', state: 'FAILING', consecutiveFailures: 3, lastHits: hits }}
        checking={false}
      />,
    );
    expect(screen.getByTestId('status-badge')).toHaveTextContent('200');
    expect(screen.getByTestId('status-badge').dataset.tone).toBe('bad');
    expect(screen.getByText('200, but count = 0')).toBeInTheDocument();
    expect(screen.getByText('3 of 5 failed')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Last 5 hits: 200 passed, 200 passed, 200 but count = 0, HTTP 503, 200 but count = 0',
    );
  });
  it('alerted and paused notes; timeout badge', () => {
    wrap(
      <ApiCard
        api={{ ...base, lastStatusCode: null, lastPassed: false, state: 'ALERTED', consecutiveFailures: 5, isActive: false }}
        checking
      />,
    );
    expect(screen.getByTestId('status-badge')).toHaveTextContent('TIMEOUT');
    expect(screen.getByText('Alert sent')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-checking', 'true');
  });
});

describe('CopyCurlButton', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(copyFromPromise).mockReset();
    fetchMock.mockReset();
  });
  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it('success shows Copied and a toast', async () => {
    respond(200, { curl: "curl 'x'", missing: [] });
    vi.mocked(copyFromPromise).mockImplementation(async (p) => (await p, true));
    wrap(<CopyCurlButton apiId={7} apiName="Unlock contact" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy curl for Unlock contact' }));
    expect(await screen.findByText('curl for Unlock contact copied with its auth, headers and body.')).toBeInTheDocument();
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/apis/7/curl', expect.anything());
  });
  it('missing credential toast', async () => {
    respond(200, { curl: "curl 'x'", missing: ['token'] });
    vi.mocked(copyFromPromise).mockResolvedValue(true);
    wrap(<CopyCurlButton apiId={7} apiName="X" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('curl for X copied, but its token isn’t set yet.')).toBeInTheDocument();
  });
  it('opens the fallback dialog when copying is blocked', async () => {
    respond(200, { curl: "curl -sS 'https://a'", missing: [] });
    vi.mocked(copyFromPromise).mockResolvedValue(false);
    wrap(<CopyCurlButton apiId={7} apiName="X" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Your browser blocked automatic copying. Select the command below and copy it.')).toBeInTheDocument();
    expect(screen.getByText("curl -sS 'https://a'")).toBeInTheDocument();
  });
  it('429 toast', async () => {
    respond(429, { statusCode: 429, error: 'Too Many Requests', message: 'slow down' });
    vi.mocked(copyFromPromise).mockResolvedValue(false);
    wrap(<CopyCurlButton apiId={7} apiName="X" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Too many copies in a minute. Try again shortly.')).toBeInTheDocument());
  });
});
