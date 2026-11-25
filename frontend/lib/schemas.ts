// lib/schemas.ts — section 10.1
import { z } from 'zod';

const keyPath = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;
const httpUrl = z
  .string()
  .trim()
  .regex(/^https?:\/\/\S+$/, 'Base URL must start with http:// or https://')
  .transform((s) => s.replace(/\/$/, ''));
const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const headerLines = z
  .string()
  .refine((s) => lines(s).every((l) => l.indexOf(':') > 0), 'Each header line needs the form Name: value.');
const optionalKey = (label: string) =>
  z
    .string()
    .trim()
    .refine((s) => !s || keyPath.test(s), `${label} can use letters, digits, _ and dots, like data.total.`);
const isJson = (s: string) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};
const FREQ = 'Frequency must be between 1 and 1440 minutes.';
const frequency = z.coerce.number({ invalid_type_error: FREQ }).int(FREQ).min(1, FREQ).max(1440, FREQ);

export const authSchema = z.object({
  method: z.enum(['INHERIT', 'NONE', 'BEARER', 'BASIC', 'API_KEY', 'COOKIE']),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  headerName: z.string().trim().optional(), // blank = X-API-Key on the server
  apiKey: z.string().optional(),
  cookie: z.string().optional(),
});

export const moduleSchema = z.object({
  name: z.string().trim().min(1, 'Give the module a name.').max(150),
  environmentId: z.coerce.number().int(),
  baseUrl: httpUrl,
  auth: authSchema.refine((a) => a.method !== 'INHERIT', 'Pick an auth method.'),
  headers: headerLines,
  frequencyMinutes: frequency,
  emailGroupId: z.number().int().nullable(),
  isActive: z.boolean(),
});

export const apiSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the API a name.').max(150),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']),
    endpoint: z.string().trim().startsWith('/', 'Endpoint must start with / (for example /api/v1/events).'),
    baseUrlOverride: z.union([z.literal(''), httpUrl]),
    auth: authSchema,
    headers: headerLines,
    body: z
      .string()
      .trim()
      .refine((s) => !s || isJson(s), 'Request body must be valid JSON.'),
    tagKey: z.string().trim().max(100),
    tagValue: z.string().trim().max(200),
    countKey: optionalKey('Count key'),
    dataKey: optionalKey('Data array key'),
    frequencyMinutes: z.union([z.literal(''), frequency]),
    isActive: z.boolean(),
  })
  .refine((v) => !!v.tagKey === !!v.tagValue, {
    path: ['tagValue'],
    message: 'Fill in both the tag name and value, or leave both blank.',
  });

export const groupSchema = z.object({
  name: z.string().trim().min(1, 'Give the group a name.').max(100),
  emails: z.string(), // split + validated in transform.ts
});

export type ModuleFormIn = z.input<typeof moduleSchema>;
export type ModuleFormOut = z.output<typeof moduleSchema>;
export type ApiFormIn = z.input<typeof apiSchema>;
export type ApiFormOut = z.output<typeof apiSchema>;
export type GroupFormIn = z.input<typeof groupSchema>;
export type GroupFormOut = z.output<typeof groupSchema>;
