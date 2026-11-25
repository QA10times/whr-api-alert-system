'use client';
import { useState } from 'react';
import { EmailGroupCard, GroupFormDialog } from '@/components/groups/Groups';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useGroups } from '@/lib/queries';

export default function EmailGroupsPage() {
  const groups = useGroups();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'rename'; id: number } | null>(null);
  const list = groups.data ?? [];
  const renaming = dialog?.mode === 'rename' ? list.find((g) => g.id === dialog.id) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-[26px] font-semibold">Email groups</h1>
          <p className="mt-1 text-meta text-muted">Each module sends its failure alerts to one group.</p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ mode: 'create' })}>
          New group
        </Button>
      </header>

      {groups.isLoading && <Skeleton className="h-48" />}
      {groups.error && <ErrorState message={groups.error.message} onRetry={() => groups.refetch()} />}
      {groups.data && list.length === 0 && <EmptyState title="No email groups yet. Create one, then pick it on a module." />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((g) => (
          <EmailGroupCard key={g.id} group={g} onRename={() => setDialog({ mode: 'rename', id: g.id })} />
        ))}
      </div>

      <GroupFormDialog
        mode={dialog?.mode ?? 'create'}
        group={renaming}
        groups={list}
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </div>
  );
}
