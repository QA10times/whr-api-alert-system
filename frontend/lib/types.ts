// lib/types.ts — section 7.2 of the frontend design. Mirrors the backend contract.
export type EnvKey = 'gtm' | 'geo';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
export type AuthMethod = 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY' | 'COOKIE';
export type ApiState = 'OK' | 'FAILING' | 'ALERTED';

export interface Hit {
  code: number | null;
  passed: boolean;
  reason: string | null;
}
export interface Tag {
  key: string;
  value: string;
}

export interface ApiCardData {
  id: number;
  name: string;
  method: HttpMethod;
  endpoint: string;
  tag: Tag | null;
  passRule: { countKey: string | null; dataKey: string | null };
  frequencyMinutes: number;
  frequencySource: 'api' | 'module';
  isActive: boolean;
  lastStatusCode: number | null;
  lastPassed: boolean | null;
  lastFailureReason: string | null;
  lastRunAt: string | null;
  lastHits: Hit[]; // oldest first, max 5
  consecutiveFailures: number;
  failureThreshold: number;
  state: ApiState;
}
export interface SummaryModule {
  id: number;
  name: string;
  frequencyMinutes: number;
  isActive: boolean;
  emailGroup: { id: number; name: string } | null;
  apis: ApiCardData[];
}
export interface Summary {
  platform: string;
  environment: { id: number; key: EnvKey; name: string; baseUrl: string | null };
  counts: { apis: number; failing: number; alertsOpen: number; modules: number };
  modules: SummaryModule[];
}
export interface AuthStatus {
  method: AuthMethod | 'INHERIT';
  configured: boolean;
  missing: string[];
}
export interface AuthConfig {
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  apiKey?: string;
  cookie?: string;
}
export interface RunnerStatus {
  running: boolean;
  environment: EnvKey | null;
  currentApi: { id: number; name: string } | null;
  done: number;
  total: number;
  heartbeatAt: string | null;
}
export interface AlertRow {
  id: number;
  apiId: number;
  apiName: string;
  moduleName: string;
  kind: 'FAILURE' | 'RECOVERY';
  statusCode: number | null;
  failureReason: string | null;
  observedAt: string;
  firstFailedAt: string;
  tag: Tag | null;
  groupName: string | null;
  recipients: string[];
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  /** Why delivery failed ("no recipients", an SMTP error), or a note on a sent alert. */
  errorMessage: string | null;
  sentAt: string | null;
}
export interface AlertDetail extends AlertRow {
  subject: string;
  bodyText: string;
  lastResults: Hit[];
}
export interface CurlResponse {
  curl: string;
  missing: string[];
}

// ---- Shapes the backend design names but does not spell out; these match the NestJS responses. ----
/** GET /platforms */
export interface Platform {
  id: number;
  key: string;
  name: string;
  environments: { id: number; key: EnvKey; name: string; baseUrl: string | null; isDefault: boolean }[];
}
export interface GroupRef {
  id: number;
  name: string;
  memberCount: number;
}
/** GET /modules?env= */
export interface ModuleListItem {
  id: number;
  name: string;
  environmentId: number;
  environment: EnvKey;
  baseUrl: string;
  authMethod: AuthMethod;
  frequencyMinutes: number;
  isActive: boolean;
  apiCount: number;
  failingCount: number;
  emailGroup: GroupRef | null;
}
export interface ApiRow extends ApiCardData {
  moduleId: number;
  baseUrlOverride: string | null;
  sortOrder: number;
}
/** GET /modules/:id, and the result of POST /modules and PATCH /modules/:id */
export interface ModuleDetail {
  id: number;
  name: string;
  environmentId: number;
  environment: EnvKey;
  baseUrl: string;
  auth: AuthStatus;
  headers: Record<string, string>;
  frequencyMinutes: number;
  failureThreshold: number;
  emailGroup: GroupRef | null;
  isActive: boolean;
  apis: ApiRow[];
}
/** GET /apis/:id, and the result of POST /modules/:id/apis and PATCH /apis/:id */
export interface ApiDetail extends ApiRow {
  moduleName: string;
  environment: EnvKey;
  effectiveBaseUrl: string;
  moduleBaseUrl: string;
  moduleFrequencyMinutes: number;
  moduleAuthMethod: AuthMethod;
  auth: AuthStatus;
  headers: Record<string, string>;
  body: unknown | null;
  ownFrequencyMinutes: number | null;
  timeoutMs: number;
  /** Set by PATCH /apis/:id when the request fingerprint changed. */
  streakReset?: boolean;
}
/** GET /apis/:id/runs, newest first */
export interface RunRow {
  id: number;
  startedAt: string;
  statusCode: number | null;
  passed: boolean;
  failureReason: string | null;
  countValue: number | null;
  itemCount: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  responseSnippet: string | null;
}
/** GET /email-groups */
export interface EmailGroup {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  members: { id: number; email: string }[];
  usedBy: { id: number; name: string; environment: EnvKey }[];
}
/** POST /email-groups/:id/members: the group plus which addresses were added and which already existed. */
export interface AddMembersResult extends EmailGroup {
  added: string[];
  existing: string[];
}
/** 202 from POST /apis/:id/run and POST /platforms/:key/environments/:env/run */
export interface RunAccepted extends RunnerStatus {
  queued: number;
}
