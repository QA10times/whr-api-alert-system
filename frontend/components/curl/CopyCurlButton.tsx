'use client';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { copyFromPromise } from '@/lib/clipboard';
import { MISSING_LABEL } from '@/lib/format';
import type { CurlResponse } from '@/lib/types';

export function CopyCurlButton({ apiId, apiName, size = 'sm' }: { apiId: number; apiName: string; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    setBusy(true);
    // Start the fetch and hand its promise to the clipboard inside the click handler (Safari).
    const res = api<CurlResponse>(`/apis/${apiId}/curl`);
    const text = res.then((r) => r.curl);
    text.catch(() => undefined); // errors are handled below via `res`
    const ok = await copyFromPromise(text);
    try {
      const { curl, missing } = await res;
      if (!ok) {
        setFallback(curl);
      } else {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
        toast({
          title: missing.length
            ? `curl for ${apiName} copied, but its ${MISSING_LABEL[missing[0]] ?? missing[0]} isn’t set yet.`
            : `curl for ${apiName} copied with its auth, headers and body.`,
        });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) toast({ title: 'Too many copies in a minute. Try again shortly.', tone: 'bad' });
      else toast({ title: e instanceof Error ? e.message : 'Couldn’t copy the curl command.', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={size} onClick={onClick} loading={busy} aria-label={`Copy curl for ${apiName}`}>
        {!busy && (copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />)}
        {copied ? 'Copied' : 'Copy curl'}
      </Button>
      <CurlFallbackDialog curl={fallback} onClose={() => setFallback(null)} />
    </>
  );
}

export function CurlFallbackDialog({ curl, onClose }: { curl: string | null; onClose: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!curl || !pre.current) return;
    const t = setTimeout(() => {
      if (!pre.current) return;
      const range = document.createRange();
      range.selectNodeContents(pre.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 50);
    return () => clearTimeout(t);
  }, [curl]);
  return (
    <Dialog
      open={curl !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Copy curl"
      wide
      footer={
        <Button variant="primary" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="mb-3 text-meta text-muted">Your browser blocked automatic copying. Select the command below and copy it.</p>
      <pre
        ref={pre}
        tabIndex={0}
        className="overflow-x-auto whitespace-pre-wrap break-all rounded-ctl border border-line bg-sunk p-3 font-mono text-[12.5px]"
      >
        {curl}
      </pre>
    </Dialog>
  );
}
