/** Allowed shape for count_key / data_key (design → Validation rules). */
export const JSON_PATH_RE = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;

/**
 * Resolve a dot path ("data.total", "result.items", "items.0.id") inside a parsed JSON body.
 * Returns undefined when any segment is missing.
 */
export function getPath(body: unknown, path: string): unknown {
  let cur: unknown = body;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(seg)) return undefined;
      cur = cur[Number(seg)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return cur;
}
