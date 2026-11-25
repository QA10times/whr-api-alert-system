import type { ValueTransformer } from 'typeorm';

/** BIGSERIAL / NUMERIC come back from pg as strings; expose them as numbers. */
export const numeric: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};
