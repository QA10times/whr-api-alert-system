'use client';
import { useEffect, useState } from 'react';
import { ApiFormDialog } from '@/components/modules/ApiFormDialog';
import { ModuleFormDialog } from '@/components/modules/ModuleFormDialog';
import { ApisTable, ModuleList, ModuleSettings } from '@/components/modules/ModuleParts';
import { EnvToggle } from '@/components/monitor/PlatformCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useEnv, useModule, useModules } from '@/lib/queries';
import type { EnvKey } from '@/lib/types';

type ModuleDialog = { mode: 'create' } | { mode: 'edit'; id: number } | null;
type ApiDialog = { mode: 'create'; moduleId: number } | { mode: 'edit'; moduleId: number; apiId: number } | null;

export default function ModulesPage() {
  const { env, setEnv, setParams, params, environments } = useEnv();
  const modules = useModules(env);
  const list = modules.data ?? [];
  const requested = Number(params.get('module'));
  const selectedId = list.some((m) => m.id === requested) ? requested : (list[0]?.id ?? null);
  const detail = useModule(selectedId);
  const [moduleDialog, setModuleDialog] = useState<ModuleDialog>(null);
  const [apiDialog, setApiDialog] = useState<ApiDialog>(null);
  const envOptions: EnvKey[] = environments.length ? environments.map((e) => e.key) : ['gtm', 'geo'];

  // /modules?new=1 (from the Monitor empty state) opens the create dialog once.
  useEffect(() => {
    if (params.get('new') === '1') {
      setModuleDialog({ mode: 'create' });
      setParams({ new: null });
    }
  }, [params, setParams]);

  const newModule = (
    <Button variant="primary" onClick={() => setModuleDialog({ mode: 'create' })}>
      New module
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[26px] font-semibold">Modules</h1>
        <EnvToggle value={env} options={envOptions} onChange={setEnv} />
        {newModule}
      </header>

      {modules.isLoading && <Skeleton className="h-72" />}
      {modules.error && <ErrorState message={modules.error.message} onRetry={() => modules.refetch()} />}
      {modules.data && list.length === 0 && (
        <EmptyState title={`No modules in ${env}. A module groups APIs that share a base URL, auth and alert group.`} action={newModule} />
      )}

      {list.length > 0 && (
        <div className="flex flex-col gap-4 desk:grid desk:grid-cols-[260px_1fr] desk:items-start">
          <ModuleList modules={list} selectedId={selectedId} onSelect={(id) => setParams({ module: String(id) })} />
          <section aria-label="Selected module" className="card min-w-0 p-5">
            {detail.isLoading && <Skeleton className="h-60" />}
            {detail.error && <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />}
            {detail.data && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-auto text-[17px] font-semibold">{detail.data.name}</h2>
                  <Button onClick={() => setModuleDialog({ mode: 'edit', id: detail.data.id })}>Edit module</Button>
                  <Button variant="primary" onClick={() => setApiDialog({ mode: 'create', moduleId: detail.data.id })}>
                    Add API
                  </Button>
                </div>
                <ModuleSettings module={detail.data} />
                {detail.data.apis.length === 0 ? (
                  <div className="flex flex-col items-start gap-3 py-4 text-body text-muted">
                    <p>This module has no APIs yet.</p>
                    <Button variant="primary" onClick={() => setApiDialog({ mode: 'create', moduleId: detail.data.id })}>
                      Add API
                    </Button>
                  </div>
                ) : (
                  <ApisTable
                    apis={detail.data.apis}
                    onEdit={(apiId) => setApiDialog({ mode: 'edit', moduleId: detail.data.id, apiId })}
                  />
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <ModuleFormDialog
        mode={moduleDialog?.mode ?? 'create'}
        moduleId={moduleDialog?.mode === 'edit' ? moduleDialog.id : undefined}
        env={env}
        open={moduleDialog !== null}
        onOpenChange={(o) => !o && setModuleDialog(null)}
        onSaved={(m) => {
          const envKey = environments.find((e) => e.id === m.environmentId)?.key ?? env;
          setParams({ env: envKey, module: String(m.id) });
        }}
        onDeleted={() => setParams({ module: null })}
      />
      {apiDialog && (
        <ApiFormDialog
          mode={apiDialog.mode}
          moduleId={apiDialog.moduleId}
          apiId={apiDialog.mode === 'edit' ? apiDialog.apiId : undefined}
          open
          onOpenChange={(o) => !o && setApiDialog(null)}
        />
      )}
    </div>
  );
}
