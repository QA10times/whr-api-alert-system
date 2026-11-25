'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { applyServerError, AuthFields, describe, errorAt, Field, FrequencyField, HeadersField } from '@/components/forms/fields';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmButton, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { MISSING_LABEL } from '@/lib/format';
import { useDeleteModule, useGroups, useModule, usePlatforms, useSaveModule, PLATFORM } from '@/lib/queries';
import { moduleSchema, type ModuleFormIn, type ModuleFormOut } from '@/lib/schemas';
import { authToApi, emptyAuth, headersToObject, objectToHeaders, type AuthForm } from '@/lib/transform';
import type { EnvKey, ModuleDetail } from '@/lib/types';

interface Props {
  mode: 'create' | 'edit';
  moduleId?: number;
  env: EnvKey;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (m: ModuleDetail) => void;
  onDeleted?: () => void;
}

export function ModuleFormDialog(props: Props) {
  const { mode, moduleId, open, onOpenChange } = props;
  const detail = useModule(mode === 'edit' && open ? (moduleId ?? null) : null);
  const title = mode === 'create' ? 'New module' : 'Edit module';
  if (!open) return null;
  if (mode === 'edit' && !detail.data) {
    return (
      <Dialog open onOpenChange={onOpenChange} title={title}>
        <Skeleton className="h-72" />
      </Dialog>
    );
  }
  // Mounted only while open, so revealed credentials never outlive the dialog.
  return <ModuleForm {...props} detail={detail.data ?? null} title={title} />;
}

function ModuleForm({ mode, env, onOpenChange, onSaved, onDeleted, detail, title }: Props & { detail: ModuleDetail | null; title: string }) {
  const toast = useToast();
  const { data: platforms } = usePlatforms();
  const { data: groups } = useGroups();
  const save = useSaveModule();
  const remove = useDeleteModule();
  const [formError, setFormError] = useState<string | null>(null);
  const envs = platforms?.find((p) => p.key === PLATFORM)?.environments ?? [];
  const currentEnvId = envs.find((e) => e.key === env)?.id ?? envs[0]?.id ?? 0;

  const form = useForm<ModuleFormIn, unknown, ModuleFormOut>({
    resolver: zodResolver(moduleSchema),
    defaultValues: detail
      ? {
          name: detail.name,
          environmentId: detail.environmentId,
          baseUrl: detail.baseUrl,
          auth: emptyAuth(detail.auth.method === 'INHERIT' ? 'NONE' : detail.auth.method),
          headers: objectToHeaders(detail.headers),
          frequencyMinutes: detail.frequencyMinutes,
          emailGroupId: detail.emailGroup?.id ?? null,
          isActive: detail.isActive,
        }
      : {
          name: '',
          environmentId: currentEnvId,
          baseUrl: '',
          auth: emptyAuth('NONE'),
          headers: '',
          frequencyMinutes: 5,
          emailGroupId: null,
          isActive: true,
        },
  });
  const { register, formState, watch, handleSubmit, setValue } = form;
  const method = watch('auth.method');
  useEffect(() => {
    if (mode === 'create' && !form.getValues('environmentId') && currentEnvId) setValue('environmentId', currentEnvId);
  }, [currentEnvId, mode, form, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const dto = {
      name: v.name,
      environmentId: v.environmentId,
      baseUrl: v.baseUrl,
      auth: authToApi(v.auth as AuthForm, formState.dirtyFields.auth as never, mode === 'create'),
      headers: headersToObject(v.headers),
      frequencyMinutes: v.frequencyMinutes,
      emailGroupId: v.emailGroupId,
      isActive: v.isActive,
    };
    try {
      const m = await save.mutateAsync({ id: detail?.id, dto });
      const missing = m.auth?.missing ?? [];
      if (mode === 'create') toast({ title: `Module “${m.name}” created. Add its first API.` });
      else if (missing.length) toast({ title: `Module saved, but its ${MISSING_LABEL[missing[0]] ?? missing[0]} is empty.` });
      else toast({ title: 'Module saved.' });
      onSaved?.(m);
      onOpenChange(false);
    } catch (e) {
      setFormError(applyServerError(form, e, 'name'));
    }
  });

  const err = (n: string) => errorAt(formState.errors, n);
  const status = detail && detail.auth.method === method ? detail.auth : null;

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
              label="Delete module"
              confirmLabel="Click again to delete this module and its APIs"
              loading={remove.isPending}
              onConfirm={() =>
                remove.mutate(detail.id, {
                  onSuccess: () => {
                    toast({ title: `Module “${detail.name}” deleted.` });
                    onOpenChange(false);
                    onDeleted?.();
                  },
                  onError: (e) => setFormError(e.message),
                })
              }
            />
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formState.isSubmitting}>
              {mode === 'create' ? 'Create module' : 'Save changes'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && (
          <div role="alert" className="rounded-ctl border border-bad bg-bad-bg px-3 py-2 text-meta text-bad">
            {formError}
          </div>
        )}
        <Field id="m-name" label="Module name" error={err('name')}>
          <input {...describe('m-name', false, err('name'))} {...register('name')} className="input" autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="m-env" label="Environment" error={err('environmentId')}>
            <select {...describe('m-env', false)} {...register('environmentId', { valueAsNumber: true })} className="input">
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.key}
                </option>
              ))}
            </select>
          </Field>
          <FrequencyField form={form} name="frequencyMinutes" hint="Default 5. APIs can override." />
        </div>
        <Field id="m-base" label="Base URL" error={err('baseUrl')}>
          <input
            {...describe('m-base', false, err('baseUrl'))}
            {...register('baseUrl')}
            placeholder="https://gtm.whr.ai"
            spellCheck={false}
            className="input font-mono text-[13px]"
          />
        </Field>
        <Field id="m-auth" label="Auth method" error={err('auth')}>
          <select {...describe('m-auth', false, err('auth'))} {...register('auth.method')} className="input">
            <option value="NONE">None</option>
            <option value="BEARER">Bearer token</option>
            <option value="BASIC">Basic</option>
            <option value="API_KEY">API key header</option>
            <option value="COOKIE">Cookie</option>
          </select>
        </Field>
        <AuthFields form={form} method={method} status={status} revealUrl={detail ? `/modules/${detail.id}/credentials` : undefined} />
        <HeadersField
          form={form}
          name="headers"
          label="Headers for every API"
          hint="One per line, as Name: value. An API’s own header with the same name wins."
          placeholder="X-Client: whr-monitor"
        />
        <Field id="m-group" label="Alert email group">
          <Controller
            control={form.control}
            name="emailGroupId"
            render={({ field }) => (
              <select
                id="m-group"
                className="input"
                value={field.value === null || field.value === undefined ? '' : String(field.value)}
                onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                onBlur={field.onBlur}
              >
                <option value="">No group</option>
                {(groups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.members.length})
                  </option>
                ))}
              </select>
            )}
          />
        </Field>
        <label className="flex min-h-[40px] items-center gap-2 text-meta">
          <input type="checkbox" {...register('isActive')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          Run checks for this module
        </label>
      </div>
    </Dialog>
  );
}
