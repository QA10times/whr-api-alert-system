import { Injectable } from '@nestjs/common';
import { findHeader } from '../common/headers.util';
import type { BuiltRequest } from '../monitor/request-builder.service';

/** POSIX single-quote: ' becomes '\'' so values paste safely into bash or zsh. */
export function shQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/**
 * Render the runnable curl for a built request (design → Copy curl).
 * Missing credentials render as <token>-style markers.
 */
export function renderCurl(r: BuiltRequest): string {
  const lines: string[] = [`curl -sS -X ${r.method} ${shQuote(r.url)}`];
  const h = r.auth.header;
  if (h) lines.push(`-H ${shQuote(`${h.name}: ${h.prefix}${h.secret ?? `<${h.secretKey}>`}`)}`);
  const b = r.auth.basic;
  if (b) lines.push(`-u ${shQuote(`${b.username ?? '<username>'}:${b.password ?? '<password>'}`)}`);
  for (const [name, value] of Object.entries(r.headers)) {
    // the auth header wins over a plain header with the same name, as in the runner
    if (h && findHeader({ [h.name]: '' }, name) !== undefined) continue;
    if (b && name.toLowerCase() === 'authorization') continue;
    lines.push(`-H ${shQuote(`${name}: ${value}`)}`);
  }
  if (r.body !== null) lines.push(`--data-raw ${shQuote(r.body)}`);
  return lines.join(' \\\n  ');
}

@Injectable()
export class CurlService {
  render(r: BuiltRequest): { curl: string; missing: string[] } {
    return { curl: renderCurl(r), missing: r.missing };
  }
}
