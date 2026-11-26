import { Injectable } from '@nestjs/common';
import { getPath } from '../common/json-path.util';
import type { ProbeResult } from './http-prober.service';

export interface Validation {
  passed: boolean;
  /** First failed check (design → Failure tracking); null when passed. */
  reason: string | null;
  countValue: number | null;
  itemsCount: number | null;
}

interface PassRule {
  countKey: string | null;
  dataKey: string | null;
}

const fail = (reason: string, countValue: number | null = null, itemsCount: number | null = null): Validation => ({
  passed: false,
  reason: reason.slice(0, 300),
  countValue,
  itemsCount,
});

/**
 * Pass rule: HTTP 200, then count_key > 0, then data_key holds more than 1 object.
 * The first check that fails becomes the reason. A blank key skips its check.
 */
export function validateResponse(rule: PassRule, probe: Pick<ProbeResult, 'statusCode' | 'errorKind' | 'isJson' | 'json'>): Validation {
  const status = probe.statusCode;
  if (status !== 200) {
    if (status === null) return fail(probe.errorKind === 'NETWORK_ERROR' ? 'Network error, no response' : 'Timeout, no response');
    return fail(`HTTP ${status}`);
  }
  if ((rule.countKey || rule.dataKey) && !probe.isJson) return fail('response is not JSON');

  let countValue: number | null = null;
  let itemsCount: number | null = null;
  if (rule.countKey) {
    const count = getPath(probe.json, rule.countKey);
    if (typeof count !== 'number' || Number.isNaN(count)) return fail(`${rule.countKey} missing or not a number`);
    countValue = count;
    if (!(count > 0)) return fail(`${rule.countKey} = ${count}`, countValue);
  }
  if (rule.dataKey) {
    const arr = getPath(probe.json, rule.dataKey);
    if (!Array.isArray(arr)) return fail(`${rule.dataKey} missing or not an array`, countValue);
    itemsCount = arr.filter((x) => x !== null && typeof x === 'object').length;
    if (!(itemsCount > 1)) return fail(`${rule.dataKey} has ${itemsCount} object${itemsCount === 1 ? '' : 's'}`, countValue, itemsCount);
  }
  return { passed: true, reason: null, countValue, itemsCount };
}

@Injectable()
export class ResponseValidator {
  validate(rule: PassRule, probe: ProbeResult): Validation {
    return validateResponse(rule, probe);
  }
}
