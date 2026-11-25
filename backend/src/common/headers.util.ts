/** RFC 7230 token: valid HTTP header name. */
export const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type HeaderMap = Record<string, string>;

/** Parse "Name: value" lines (dashboard text area format) into an object. Blank lines are skipped. */
export function parseHeaderLines(text: string): HeaderMap {
  const out: HeaderMap = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i <= 0) throw new Error(`Header line "${line}" must look like "Name: value"`);
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** Case-insensitive lookup of a header name; returns the stored key or undefined. */
export function findHeader(headers: HeaderMap, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(headers).find((k) => k.toLowerCase() === lower);
}

export function hasHeader(headers: HeaderMap, name: string): boolean {
  return findHeader(headers, name) !== undefined;
}

/** Set a header, replacing any existing one with the same name in any case. */
export function setHeader(headers: HeaderMap, name: string, value: string): HeaderMap {
  const existing = findHeader(headers, name);
  if (existing !== undefined) delete headers[existing];
  headers[name] = value;
  return headers;
}

/**
 * Overlay headers in order: later layers win on a case-insensitive name clash,
 * and the winning layer's spelling of the name is kept.
 */
export function mergeHeaders(...layers: (HeaderMap | null | undefined)[]): HeaderMap {
  const out: HeaderMap = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) setHeader(out, k, String(v));
  }
  return out;
}
