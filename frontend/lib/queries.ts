'use client';
// lib/queries.ts — section 7.3: query keys, polling and invalidation
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, del, patch, post } from './api';
import type {
  AddMembersResult,
  AlertDetail,
  AlertRow,
  ApiDetail,
  EmailGroup,
  EnvKey,
  ModuleDetail,
  ModuleListItem,
  Platform,
  RunAccepted,
  RunnerStatus,
  RunRow,
  Summary,
  AuthConfig,
} from './types';

export const PLATFORM = 'whr';

export const qk = {
  platforms: ['platforms'] as const,
  summary: (env: EnvKey) => ['summary', env] as const,
  runner: ['runner'] as const,
  alerts: (env: EnvKey) => ['alerts', env] as const,
  alert: (id: number) => ['alert', id] as const,
  modules: (env: EnvKey) => ['modules', env] as const,
  module: (id: number) => ['module', id] as const,
  api: (id: number) => ['api', id] as const,
  runs: (id: number) => ['runs', id] as const,
  groups: ['groups'] as const,
};

// ---------- environment in the URL ----------

export function usePlatforms() {
  return useQuery({ queryKey: qk.platforms, queryFn: () => api<Platform[]>('/platforms'), staleTime: 3_600_000 });
}

/** Reads ?env=, falls back to the default environment, and updates the URL with router.replace. */
export function useEnv() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: platforms } = usePlatforms();
  const envs = platforms?.find((p) => p.key === PLATFORM)?.environments ?? [];
  const fallback: EnvKey = envs.find((e) => e.isDefault)?.key ?? 'gtm';
  const raw = params.get('env');
  const known = envs.length ? envs.some((e) => e.key === raw) : raw === 'gtm' || raw === 'geo';
  const env: EnvKey = known ? (raw as EnvKey) : fallback;

  const setParams = useCallback(
    (patchParams: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patchParams)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  const setEnv = useCallback((e: EnvKey) => setParams({ env: e, module: null }), [setParams]);
  const environment = envs.find((e) => e.key === env);
  return { env, setEnv, setParams, params, environments: envs, environment };
}

// ---------- reads ----------

export function useRunner() {
  return useQuery({
    queryKey: qk.runner,
    queryFn: () => api<RunnerStatus>('/runner/status'),
    refetchInterval: (q) => (q.state.data?.running ? 2_000 : 30_000),
  });
}

export function useSummary(env: EnvKey) {
  const running = useRunner().data?.running ?? false;
  return useQuery({
    queryKey: qk.summary(env),
    queryFn: () => api<Summary>(`/platforms/${PLATFORM}/environments/${env}/summary`),
    refetchInterval: running ? 2_000 : 30_000,
  });
}

export function useAlerts(env: EnvKey) {
  return useQuery({
    queryKey: qk.alerts(env),
    queryFn: () => api<AlertRow[]>(`/alerts?env=${env}&limit=50`),
    refetchInterval: 30_000,
  });
}

export function useAlert(id: number | null) {
  return useQuery({
    queryKey: qk.alert(id ?? 0),
    queryFn: () => api<AlertDetail>(`/alerts/${id}`),
    enabled: id !== null,
    staleTime: Infinity,
  });
}

export function useModules(env: EnvKey) {
  return useQuery({ queryKey: qk.modules(env), queryFn: () => api<ModuleListItem[]>(`/modules?env=${env}`) });
}
export function useModule(id: number | null) {
  return useQuery({
    queryKey: qk.module(id ?? 0),
    queryFn: () => api<ModuleDetail>(`/modules/${id}`),
    enabled: id !== null,
  });
}
export function useApiDetail(id: number | null) {
  return useQuery({
    queryKey: qk.api(id ?? 0),
    queryFn: () => api<ApiDetail>(`/apis/${id}`),
    enabled: id !== null,
  });
}
export function useRuns(id: number) {
  return useQuery({
    queryKey: qk.runs(id),
    queryFn: () => api<RunRow[]>(`/apis/${id}/runs?limit=50`),
    refetchInterval: 30_000,
  });
}
export function useGroups() {
  return useQuery({ queryKey: qk.groups, queryFn: () => api<EmailGroup[]>('/email-groups') });
}

/**
 * When runner.running turns from true to false, refresh summary, alerts and every run
 * history so final results and new alerts appear at once. Returns when the last run finished.
 */
export function useRunnerWatcher() {
  const qc = useQueryClient();
  const { data } = useRunner();
  const wasRunning = useRef<boolean | null>(null);
  const [finished, setFinished] = useState<{ at: Date; total: number } | null>(null);
  useEffect(() => {
    if (!data) return;
    if (wasRunning.current && !data.running) {
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['modules'] });
      qc.invalidateQueries({ queryKey: ['module'] });
      qc.invalidateQueries({ queryKey: ['api'] });
      setFinished({ at: new Date(), total: data.total });
    }
    wasRunning.current = data.running;
  }, [data, qc]);
  return { runner: data, finished };
}

// ---------- mutations ----------

export interface ModuleDto {
  name: string;
  environmentId: number;
  baseUrl: string;
  auth: { method: string; config: AuthConfig };
  headers: Record<string, string>;
  frequencyMinutes: number;
  emailGroupId: number | null;
  isActive: boolean;
}
export interface ApiDto {
  name: string;
  method: string;
  endpoint: string;
  baseUrlOverride: string | null;
  auth: { method: string; config: AuthConfig };
  headers: Record<string, string>;
  body: unknown | null;
  tagKey: string | null;
  tagValue: string | null;
  countKey: string | null;
  dataKey: string | null;
  frequencyMinutes: number | null;
  isActive: boolean;
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: readonly (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useSaveModule() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, dto }: { id?: number; dto: Partial<ModuleDto> }) =>
      id ? api<ModuleDetail>(`/modules/${id}`, patch(dto)) : api<ModuleDetail>('/modules', post(dto)),
    onSuccess: (m) => inv(['modules'], qk.module(m.id), ['summary'], qk.groups),
  });
}
export function useDeleteModule() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/modules/${id}`, del),
    onSuccess: () => inv(['modules'], ['module'], ['summary'], qk.groups),
  });
}
export function useSaveApi() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, moduleId, dto }: { id?: number; moduleId: number; dto: Partial<ApiDto> }) =>
      id ? api<ApiDetail>(`/apis/${id}`, patch(dto)) : api<ApiDetail>(`/modules/${moduleId}/apis`, post(dto)),
    onSuccess: (a, v) => inv(qk.module(v.moduleId), qk.api(a.id), ['summary'], ['modules']),
  });
}
export function useDeleteApi() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id }: { id: number; moduleId: number }) => api<void>(`/apis/${id}`, del),
    onSuccess: (_d, v) => inv(qk.module(v.moduleId), ['summary'], ['modules']),
  });
}
export function useRunCycle() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (env: EnvKey) => api<RunAccepted>(`/platforms/${PLATFORM}/environments/${env}/run`, post()),
    onSuccess: () => inv(qk.runner),
  });
}
export function useRunApi() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api<RunAccepted>(`/apis/${id}/run`, post()),
    onSuccess: () => inv(qk.runner),
  });
}

export function useCreateGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (dto: { name: string; emails: string[] }) => api<EmailGroup>('/email-groups', post(dto)),
    onSuccess: () => inv(qk.groups, ['modules']),
  });
}
export function useRenameGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api<EmailGroup>(`/email-groups/${id}`, patch({ name })),
    onSuccess: () => inv(qk.groups, ['modules'], ['module'], ['summary']),
  });
}
export function useDeleteGroup() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/email-groups/${id}`, del),
    onSuccess: () => inv(qk.groups, ['modules'], ['module'], ['summary']),
  });
}
export function useAddMembers() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, emails }: { id: number; emails: string[] }) =>
      api<AddMembersResult>(`/email-groups/${id}/members`, post({ emails })),
    onSuccess: () => inv(qk.groups, ['modules'], ['module']),
  });
}
export function useRemoveMember() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, memberId }: { id: number; memberId: number; email: string }) =>
      api<void>(`/email-groups/${id}/members/${memberId}`, del),
    onSuccess: () => inv(qk.groups, ['modules'], ['module']),
  });
}
