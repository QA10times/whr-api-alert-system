import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { HEADER_NAME_RE } from './headers.util';
import { JSON_PATH_RE } from './json-path.util';

/** Trim strings; leave other values alone. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Trim, and turn "" into null (optional text fields such as tag, count key). */
export const EmptyToNull = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
  });

/** Trim, drop a trailing "/", and turn "" into null. */
export const NormalizeUrl = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim().replace(/\/+$/, '');
    return t === '' ? null : t;
  });

export function isHttpUrl(v: unknown): boolean {
  if (typeof v !== 'string' || v.length > 500) return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

export function IsHttpUrl(opts?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'isHttpUrl',
      target: obj.constructor,
      propertyName: prop,
      options: { message: 'Enter a full http(s) URL, for example https://gtm.whr.ai.', ...opts },
      validator: { validate: isHttpUrl },
    });
}

/** {name: value} object with valid HTTP header names and string values. */
export function IsHeaderMap(opts?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'isHeaderMap',
      target: obj.constructor,
      propertyName: prop,
      options: { message: 'Headers must be Name: value pairs with valid header names.', ...opts },
      validator: {
        validate(v: unknown) {
          if (v === null || v === undefined) return true;
          if (typeof v !== 'object' || Array.isArray(v)) return false;
          return Object.entries(v as Record<string, unknown>).every(
            ([k, val]) => HEADER_NAME_RE.test(k) && typeof val === 'string' && val.length <= 8000 && !/[\r\n]/.test(val),
          );
        },
      },
    });
}

/** JSON object or array (or null = no body). */
export function IsJsonBody(opts?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'isJsonBody',
      target: obj.constructor,
      propertyName: prop,
      options: { message: 'Request body must be a JSON object or array.', ...opts },
      validator: { validate: (v: unknown) => v === null || v === undefined || (typeof v === 'object' && v !== null) },
    });
}

/** Dot path for count_key / data_key; null skips the check. */
export function IsJsonPathKey(opts?: ValidationOptions) {
  return (obj: object, prop: string) =>
    registerDecorator({
      name: 'isJsonPathKey',
      target: obj.constructor,
      propertyName: prop,
      options: { message: 'Use letters, digits, _ $ - and dots for nested keys, for example data.total.', ...opts },
      validator: { validate: (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.length <= 200 && JSON_PATH_RE.test(v)) },
    });
}
