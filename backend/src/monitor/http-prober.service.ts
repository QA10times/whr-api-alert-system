import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Agent, request } from 'undici';
import { BuiltRequest, sendHeaders } from './request-builder.service';

export const MAX_BODY_BYTES = 1024 * 1024; // parse up to 1 MB
export const SNIPPET_CHARS = 2000; // api_runs.response_snippet is VARCHAR(2000)

export interface ProbeResult {
  executedAt: Date;
  statusCode: number | null; // null = timeout or network error
  latencyMs: number;
  errorKind: 'TIMEOUT' | 'NETWORK_ERROR' | null;
  errorMessage: string | null;
  isJson: boolean;
  json: unknown;
  snippet: string | null;
}

const TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR', 'ETIMEDOUT']);

function classify(e: unknown, timedOut: boolean): { kind: 'TIMEOUT' | 'NETWORK_ERROR'; message: string } {
  const err = e as { code?: string; name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.code ?? err?.cause?.code ?? '';
  const isTimeout = timedOut || TIMEOUT_CODES.has(code) || err?.name === 'TimeoutError' || err?.name === 'AbortError';
  const message = [code, err?.cause?.message ?? err?.message].filter(Boolean).join(': ') || String(e);
  return { kind: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR', message: message.slice(0, 1000) };
}

/** Sends one built request with undici: timeout_ms, redirects off, body read up to 1 MB. */
@Injectable()
export class HttpProber implements OnModuleDestroy {
  private readonly agent = new Agent({ keepAliveTimeout: 10_000, connections: 4 });

  async onModuleDestroy() {
    await this.agent.close();
  }

  async probe(req: BuiltRequest, timeoutMs: number): Promise<ProbeResult> {
    const executedAt = new Date();
    const started = performance.now();
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);
    try {
      const res = await request(req.url, {
        method: req.method,
        headers: sendHeaders(req),
        body: req.body ?? undefined,
        signal: ac.signal,
        dispatcher: this.agent,
        maxRedirections: 0,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (size + buf.length > MAX_BODY_BYTES) {
          chunks.push(buf.subarray(0, MAX_BODY_BYTES - size));
          truncated = true;
          res.body.destroy();
          break;
        }
        chunks.push(buf);
        size += buf.length;
      }
      const latencyMs = Math.round(performance.now() - started);
      const text = Buffer.concat(chunks).toString('utf8');
      let json: unknown = undefined;
      let isJson = false;
      if (!truncated && text.trim()) {
        try {
          json = JSON.parse(text);
          isJson = true;
        } catch {
          /* not JSON */
        }
      }
      return {
        executedAt,
        statusCode: res.statusCode,
        latencyMs,
        errorKind: null,
        errorMessage: truncated ? 'response larger than 1 MB; not parsed' : null,
        isJson,
        json,
        snippet: text ? text.slice(0, SNIPPET_CHARS) : null,
      };
    } catch (e) {
      const { kind, message } = classify(e, timedOut);
      return {
        executedAt,
        statusCode: null,
        latencyMs: Math.round(performance.now() - started),
        errorKind: kind,
        errorMessage: message,
        isJson: false,
        json: undefined,
        snippet: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
