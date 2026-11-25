'use client';
// AuthFields, HeadersField, JsonBodyField, FrequencyField, Field — shared form pieces.
import { useState, type ReactNode } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { FieldError } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { METHOD_FIELDS } from '@/lib/transform';
import type { AuthConfig, AuthStatus } from '@/lib/types';

/** Reads a nested error message like "auth.token" from formState.errors. */
export function errorAt(errors: unknown, name: string): string | undefined {
  let cur: unknown = errors;
  for (const part of name.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const m = (cur as { message?: unknown } | undefined)?.message;
  if (typeof m === 'string') return m;
  // refine() on an object puts the message on the root of that object
  const root = (cur as { root?: { message?: string } } | undefined)?.root?.message;
  return root;
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

/** aria props tying an input to its hint and error. */
export function describe(id: string, hint: boolean, error?: string) {
  const ids = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ');
  return { id, 'aria-describedby': ids || undefined, 'aria-invalid': error ? true : undefined };
}

const INPUTS: Record<keyof AuthConfig, { label: string; secret: boolean; mono?: boolean; placeholder?: string }> = {
  token: { label: 'Bearer token', secret: true, mono: true },
  username: { label: 'Username', secret: false },
  password: { label: 'Password', secret: true },
  headerName: { label: 'Header name', secret: false, mono: true, placeholder: 'X-API-Key' },
  apiKey: { label: 'API key', secret: true, mono: true },
  cookie: { label: 'Cookie', secret: true, mono: true, placeholder: 'session=…; csrftoken=…' },
};

/**
 * Credentials for the chosen method (section 10.3). Secrets start empty in edit mode;
 * "Show credentials" fetches the audited reveal endpoint and fills them as not dirty.
 */
export function AuthFields<T extends FieldValues>({
  form,
  method,
  status,
  revealUrl,
}: {
  form: UseFormReturn<T>;
  method: string;
  /** Saved credential status for this method, or null when creating / method changed. */
  status: AuthStatus | null;
  revealUrl?: string;
}) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const fields = METHOD_FIELDS[method as keyof typeof METHOD_FIELDS] ?? [];
  if (!fields.length) return null;

  async function toggle(checked: boolean) {
    if (checked && revealUrl && status) {
      setLoading(true);
      try {
        const cfg = await api<AuthConfig>(revealUrl);
        for (const f of fields) {
          if (!form.getFieldState(`auth.${f}` as Path<T>).isDirty) {
            form.resetField(`auth.${f}` as Path<T>, { defaultValue: (cfg[f] ?? '') as never });
          }
        }
      } catch (e) {
        setLoading(false);
        toast({
          title: e instanceof ApiError && e.status === 429 ? 'Too many reveals in a minute. Try again shortly.' : (e as Error).message,
          tone: 'bad',
        });
        return;
      }
      setLoading(false);
    }
    setShow(checked);
  }

  return (
    <div className="flex flex-col gap-3 border-l-2 border-line pl-3">
      {fields.map((f) => {
        const spec = INPUTS[f];
        const name = `auth.${f}`;
        const err = errorAt(form.formState.errors, name);
        let placeholder = spec.placeholder ?? '';
        if (spec.secret && status) placeholder = status.missing.includes(f) ? 'Not set' : 'Saved — leave blank to keep';
        const id = `auth-${f}`;
        return (
          <Field key={f} id={id} label={spec.label} error={err}>
            <input
              {...describe(id, false, err)}
              {...form.register(name as Path<T>)}
              type={spec.secret && !show ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              className={`input ${spec.mono ? 'font-mono text-[13px]' : ''}`}
            />
          </Field>
        );
      })}
      <label className="flex min-h-[32px] items-center gap-2 text-meta">
        <input
          type="checkbox"
          checked={show}
          disabled={loading}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        Show credentials{loading ? '…' : ''}
      </label>
    </div>
  );
}

export function TextareaField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  placeholder,
  rows = 3,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  hint: string;
  placeholder?: string;
  rows?: number;
}) {
  const err = errorAt(form.formState.errors, name);
  const id = `f-${name}`;
  return (
    <Field id={id} label={label} hint={hint} error={err}>
      <textarea
        {...describe(id, true, err)}
        {...form.register(name)}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        className="input resize-y font-mono text-[13px]"
      />
    </Field>
  );
}

export function HeadersField<T extends FieldValues>(props: { form: UseFormReturn<T>; name: Path<T>; label: string; hint: string; placeholder?: string }) {
  return <TextareaField {...props} />;
}

export function JsonBodyField<T extends FieldValues>(props: { form: UseFormReturn<T>; name: Path<T> }) {
  return (
    <TextareaField
      {...props}
      label="Request body (JSON)"
      hint="Sent on every check and included in the copied curl."
      placeholder='{"contactId": 48213}'
      rows={5}
    />
  );
}

export function FrequencyField<T extends FieldValues>({
  form,
  name,
  hint,
  placeholder,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  hint?: string;
  placeholder?: string;
}) {
  const err = errorAt(form.formState.errors, name);
  const id = `f-${name}`;
  return (
    <Field id={id} label="Check every (min)" hint={hint} error={err}>
      <input {...describe(id, !!hint, err)} {...form.register(name)} type="number" inputMode="numeric" min={1} max={1440} placeholder={placeholder} className="input" />
    </Field>
  );
}

/** Puts backend 400/409 errors under the right inputs; returns a message for the top box otherwise. */
export function applyServerError<T extends FieldValues>(form: UseFormReturn<T>, e: unknown, nameField: Path<T>): string | null {
  if (e instanceof ApiError) {
    if (e.status === 400 && e.body.fields && Object.keys(e.body.fields).length) {
      Object.entries(e.body.fields).forEach(([k, msg], i) => form.setError(k as Path<T>, { message: msg }, { shouldFocus: i === 0 }));
      return null;
    }
    if (e.status === 409) {
      form.setError(nameField, { message: e.body.message }, { shouldFocus: true });
      return null;
    }
    return e.body.message || e.message;
  }
  return (e as Error)?.message ?? 'Something went wrong.';
}
