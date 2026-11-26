'use client';
// EmailGroupCard, MemberChip, AddEmailsForm, GroupFormDialog
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { applyServerError, describe, errorAt, Field } from '@/components/forms/fields';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmButton, FieldError } from '@/components/ui/misc';
import { useToast } from '@/components/ui/Toast';
import { plural } from '@/lib/format';
import { useAddMembers, useCreateGroup, useDeleteGroup, useRemoveMember, useRenameGroup } from '@/lib/queries';
import { groupSchema, type GroupFormIn, type GroupFormOut } from '@/lib/schemas';
import { parseEmails } from '@/lib/transform';
import type { EmailGroup } from '@/lib/types';

export function MemberChip({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <li className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-sunk pl-3 pr-1 text-[13px]">
      <span className="break-all">{email}</span>
      <button
        type="button"
        aria-label={`Remove ${email}`}
        onClick={onRemove}
        className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-line/60 hover:text-ink"
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

export function AddEmailsForm({ group }: { group: EmailGroup }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddMembers();
  const toast = useToast();
  const id = `add-${group.id}`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { valid, invalid } = parseEmails(text);
    if (invalid.length) {
      setError(`Check these addresses: ${invalid.join(', ')}`);
      return;
    }
    setError(null);
    if (!valid.length) return;
    const existing = new Set(group.members.map((m) => m.email.toLowerCase()));
    const fresh = valid.filter((v) => !existing.has(v));
    if (!fresh.length) {
      toast({ title: `Those addresses are already in ${group.name}.` });
      setText('');
      return;
    }
    add.mutate(
      { id: group.id, emails: fresh },
      {
        onSuccess: (r) => {
          // the server reports what it actually added; someone else may have added an address meanwhile
          const already = r.existing.length ? ` ${r.existing.length} already in the group.` : '';
          toast({ title: `Added ${r.added.length} to ${group.name}.${already}` });
          setText('');
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Add emails to {group.name}
        </label>
        <input
          {...describe(id, false, error ?? undefined)}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="name@10times.com, another@…"
          autoComplete="off"
          className="input"
        />
        <Button type="submit" loading={add.isPending}>
          Add
        </Button>
      </div>
      <FieldError id={`${id}-err`} message={error ?? undefined} />
    </form>
  );
}

export function EmailGroupCard({ group, onRename }: { group: EmailGroup; onRename: () => void }) {
  const remove = useRemoveMember();
  const add = useAddMembers();
  const toast = useToast();
  return (
    <article aria-labelledby={`g-${group.id}`} className="card flex flex-col gap-3 p-5">
      <header className="flex items-center gap-2">
        <h2 id={`g-${group.id}`} className="mr-auto text-[17px] font-semibold">
          {group.name}
        </h2>
        <span className="text-[12.5px] text-muted">{plural(group.members.length, 'email')}</span>
        <Button size="sm" onClick={onRename}>
          Rename
        </Button>
      </header>
      {group.members.length > 0 && (
        <ul aria-label={`Members of ${group.name}`} className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <MemberChip
              key={m.id}
              email={m.email}
              onRemove={() =>
                remove.mutate(
                  { id: group.id, memberId: m.id, email: m.email },
                  {
                    onSuccess: () =>
                      toast({
                        title: `Removed ${m.email} from ${group.name}.`,
                        action: { label: 'Undo', onClick: () => add.mutate({ id: group.id, emails: [m.email] }) },
                        duration: 5000,
                      }),
                    onError: (e) => toast({ title: e.message, tone: 'bad' }),
                  },
                )
              }
            />
          ))}
        </ul>
      )}
      <AddEmailsForm group={group} />
      <p className="text-[12.5px] text-muted">
        {group.usedBy.length
          ? `Used by ${group.usedBy.map((u) => `${u.name} (${u.environment})`).join(', ')}`
          : 'Not used by any module yet'}
      </p>
    </article>
  );
}

export function GroupFormDialog({
  mode,
  group,
  groups,
  open,
  onOpenChange,
}: {
  mode: 'create' | 'rename';
  group?: EmailGroup;
  groups: EmailGroup[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!open) return null;
  return <GroupForm mode={mode} group={group} groups={groups} onOpenChange={onOpenChange} />;
}

function GroupForm({
  mode,
  group,
  groups,
  onOpenChange,
}: {
  mode: 'create' | 'rename';
  group?: EmailGroup;
  groups: EmailGroup[];
  onOpenChange: (o: boolean) => void;
}) {
  const toast = useToast();
  const create = useCreateGroup();
  const rename = useRenameGroup();
  const remove = useDeleteGroup();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<GroupFormIn, unknown, GroupFormOut>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: group?.name ?? '', emails: '' },
  });
  const { register, handleSubmit, formState, setError } = form;
  const err = (n: string) => errorAt(formState.errors, n);

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const clash = groups.find((g) => g.id !== group?.id && g.name.toLowerCase() === v.name.toLowerCase());
    if (clash) {
      setError('name', { message: `A group named “${clash.name}” already exists.` }, { shouldFocus: true });
      return;
    }
    try {
      if (mode === 'create') {
        const { valid, invalid } = parseEmails(v.emails);
        if (invalid.length) {
          setError('emails', { message: `Check these addresses: ${invalid.join(', ')}` }, { shouldFocus: true });
          return;
        }
        await create.mutateAsync({ name: v.name, emails: valid });
        toast({ title: `Group “${v.name}” created.` });
      } else if (group) {
        await rename.mutateAsync({ id: group.id, name: v.name });
        toast({ title: 'Group renamed.' });
      }
      onOpenChange(false);
    } catch (e) {
      setFormError(applyServerError(form, e, 'name'));
    }
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={mode === 'create' ? 'New group' : 'Rename group'}
      onSubmit={onSubmit}
      footer={
        <>
          {mode === 'rename' && group && (
            <ConfirmButton
              label="Delete group"
              confirmLabel="Click again to delete — modules using it will have no group"
              loading={remove.isPending}
              onConfirm={() =>
                remove.mutate(group.id, {
                  onSuccess: () => {
                    toast({ title: `Group “${group.name}” deleted.` });
                    onOpenChange(false);
                  },
                  onError: (e) => setFormError(e.message),
                })
              }
            />
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formState.isSubmitting}>
              {mode === 'create' ? 'Create group' : 'Save changes'}
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
        <Field id="g-name" label="Group name" error={err('name')}>
          <input {...describe('g-name', false, err('name'))} {...register('name')} className="input" autoFocus />
        </Field>
        {mode === 'create' && (
          <Field id="g-emails" label="Emails" hint="Separate addresses with commas, spaces or semicolons." error={err('emails')}>
            <textarea
              {...describe('g-emails', true, err('emails'))}
              {...register('emails')}
              rows={3}
              placeholder="name@10times.com, another@…"
              className="input resize-y"
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
