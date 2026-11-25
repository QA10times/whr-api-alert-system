'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { applyServerError, AuthFields, describe, errorAt, Field, FrequencyField, HeadersField, JsonBodyField } from '@/components/forms/fields';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmButton, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { AUTH_LABEL } from '@/lib/format';
import { useApiDetail, useDeleteApi, useModule, useSaveApi } from '@/lib/queries';
import { apiSchema, type ApiFormIn, type ApiFormOut } from '@/lib/schemas';
import {
  authToApi,
  bodyFromApi,
  bodyToApi,
  emptyAuth,
  emptyToNull,
  frequencyToApi,
  headersToObject,
  nullToEmpty,
  objectToHeaders,
  type AuthForm,
} from '@/lib/transform';
import type { ApiDetail, ModuleDetail } from '@/lib/types';

interface Props {
  mode: 'create' | 'edit';
  moduleId: number;
  apiId?: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted?: () => void;
}

export function ApiFormDialog(props: Props) {
  const { mode, moduleId, apiId, open, onOpenChange } = props;
  const mod = useModule(open ? moduleId : null);
  const detail = useApiDetail(mode === 'edit' && open ? (apiId ?? null) : null);
  const title = mode === 'create' ? 'Add API' : 'Edit API';
  if (!open) return null;
  if (!mod.data || (mode === 'edit' && !detail.data)) {
    return (
      <Dialog open onOpenChange={onOpenChange} title={title}>
        <Skeleton className="h-72" />
      </Dialog>
    );
  }
  return <ApiForm {...props} module={mod.data} detail={detail.data ?? null} title={title} />;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

function ApiForm({
  mode,
  onOpenChange,
  onDeleted,
  module,
  detail,
  title,
}: Props & { module: ModuleDetail; detail: ApiDetail | null; title: string }) {
  const toast = useToast();
  const save = useSaveApi();
  const remove = useDeleteApi();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ApiFormIn, unknown, ApiFormOut>({
    resolver: zodResolver(apiSchema),
    defaultValues: detail
      ? {
          name: detail.name,
          method: detail.method,
          endpoint: detail.endpoint,
          baseUrlOverride: nullToEmpty(detail.baseUrlOverride),
          auth: emptyAuth(detail.auth.method),
          headers: objectToHeaders(detail.headers),
          body: bodyFromApi(detail.body),
          tagKey: detail.tag?.key ?? '',
          tagValue: detail.tag?.value ?? '',
          countKey: nullToEmpty(detail.passRule.countKey),
          dataKey: nullToEmpty(detail.passRule.dataKey),
          frequencyMinutes: detail.ownFrequencyMinutes ?? '',
          isActive: detail.isActive,
        }
      : {
          name: '',
          method: 'GET',
          endpoint: '',
          baseUrlOverride: '',
          auth: emptyAuth('INHERIT'),
          headers: '',
          body: '',
          tagKey: '',
          tagValue: '',
          countKey: 'count',
          dataKey: 'data',
          frequencyMinutes: '',
          isActive: true,
        },
  });
  const { register, formState, watch, handleSubmit } = form;
  const method = watch('auth.method');
  const err = (n: string) => errorAt(formState.errors, n);
  const status = detail && detail.auth.method === method ? detail.auth : null;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const dto = {
      name: v.name,
      method: v.method,
      endpoint: v.endpoint,
      baseUrlOverride: emptyToNull(v.baseUrlOverride),
      auth: authToApi(v.auth as AuthForm, formState.dirtyFields.auth as never, mode === 'create'),
      headers: headersToObject(v.headers),
      body: bodyToApi(v.body),
      tagKey: emptyToNull(v.tagKey),
      tagValue: emptyToNull(v.tagValue),
      countKey: emptyToNull(v.countKey),
      dataKey: emptyToNull(v.dataKey),
      frequencyMinutes: frequencyToApi(v.frequencyMinutes),
      isActive: v.isActive,
    };
    try {
      const a = await save.mutateAsync({ id: detail?.id, moduleId: module.id, dto });
      if (mode === 'create') toast({ title: `API “${a.name}” added. It runs on the next cycle.` });
      else if (a.streakReset) toast({ title: 'API saved. Its failure count was reset because the request or its checks changed.' });
      else toast({ title: 'API saved.' });
      onOpenChange(false);
    } catch (e) {
      setFormError(applyServerError(form, e, 'name'));
    }
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={onSubmit}
      footer={
        <>
          {mode === 'edit' && detail && (
            <ConfirmButton
              label="Delete API"
              confirmLabel="Click again to delete this API"
              loading={remove.isPending}
              onConfirm={() =>
                remove.mutate(
                  { id: detail.id, moduleId: module.id },
                  {
                    onSuccess: () => {
                      toast({ title: `API “${detail.name}” deleted.` });
                      onOpenChange(false);
                      onDeleted?.();
                    },
                    onError: (e) => setFormError(e.message),
                  },
                )
              }
            />
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formState.isSubmitting}>
              {mode === 'create' ? 'Add API' : 'Save changes'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-meta text-muted">
          In {module.name} ({module.environment})
        </p>
        {formError && (
          <div role="alert" className="rounded-ctl border border-bad bg-bad-bg px-3 py-2 text-meta text-bad">
            {formError}
          </div>
        )}
        <Field id="a-name" label="API name" error={err('name')}>
          <input {...describe('a-name', false, err('name'))} {...register('name')} className="input" autoFocus />
        </Field>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Field id="a-method" label="Method">
            <select id="a-method" {...register('method')} className="input">
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field id="a-endpoint" label="Endpoint" error={err('endpoint')}>
            <input
              {...describe('a-endpoint', false, err('endpoint'))}
              {...register('endpoint')}
              placeholder="/api/v1/events/search?q=saas"
              spellCheck={false}
              className="input font-mono text-[13px]"
            />
          </Field>
        </div>
        <Field id="a-base" label="Base URL" hint="Leave blank to use the module’s base URL." error={err('baseUrlOverride')}>
          <input
            {...describe('a-base', true, err('baseUrlOverride'))}
            {...register('baseUrlOverride')}
            placeholder={`${module.baseUrl} (module)`}
            spellCheck={false}
            className="input font-mono text-[13px]"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="a-tagk" label="Tag name" error={err('tagKey')}>
            <input {...describe('a-tagk', false, err('tagKey'))} {...register('tagKey')} placeholder="owner" className="input" />
          </Field>
          <Field id="a-tagv" label="Tag value" error={err('tagValue')}>
            <input {...describe('a-tagv', false, err('tagValue'))} {...register('tagValue')} placeholder="search-team" className="input" />
          </Field>
        </div>
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="a-count" label="Count key" hint="Must be a number above 0." error={err('countKey')}>
              <input
                {...describe('a-count', true, err('countKey'))}
                {...register('countKey')}
                spellCheck={false}
                className="input font-mono text-[13px]"
              />
            </Field>
            <Field id="a-data" label="Data array key" hint="Must hold more than 1 object." error={err('dataKey')}>
              <input
                {...describe('a-data', true, err('dataKey'))}
                {...register('dataKey')}
                spellCheck={false}
                className="input font-mono text-[13px]"
              />
            </Field>
          </div>
          <p className="hint">
            A hit passes only when the status is 200 and both checks pass. Use dots for nested keys. Leave a key blank to skip that
            check, for example on a health endpoint.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="a-auth" label="Auth method">
            <select id="a-auth" {...register('auth.method')} className="input">
              <option value="INHERIT">Same as module ({AUTH_LABEL[module.auth.method]})</option>
              <option value="NONE">None</option>
              <option value="BEARER">Bearer token</option>
              <option value="BASIC">Basic</option>
              <option value="API_KEY">API key header</option>
              <option value="COOKIE">Cookie</option>
            </select>
          </Field>
          <FrequencyField form={form} name="frequencyMinutes" placeholder={`${module.frequencyMinutes} (module)`} />
        </div>
        <AuthFields form={form} method={method} status={status} revealUrl={detail ? `/apis/${detail.id}/credentials` : undefined} />
        <HeadersField
          form={form}
          name="headers"
          label="Extra headers"
          hint="One per line, as Name: value. Added to the module’s headers."
          placeholder="X-Request-Source: monitor"
        />
        <JsonBodyField form={form} name="body" />
        <label className="flex min-h-[40px] items-center gap-2 text-meta">
          <input type="checkbox" {...register('isActive')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          Run checks for this API
        </label>
      </div>
    </Dialog>
  );
}
