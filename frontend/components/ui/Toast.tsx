'use client';
import * as RT from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  tone?: 'default' | 'bad';
  action?: { label: string; onClick: () => void };
  duration?: number;
}
type Show = (t: Omit<ToastItem, 'id'>) => void;

const Ctx = createContext<Show>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback<Show>((t) => setItems((xs) => [...xs, { ...t, id: ++seq }]), []);
  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <Ctx.Provider value={show}>
      <RT.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((t) => (
          <RT.Root
            key={t.id}
            duration={t.duration}
            onOpenChange={(open) => !open && remove(t.id)}
            className="card flex items-start gap-3 p-3 pr-2 shadow-lg data-[state=closed]:opacity-0"
          >
            <RT.Description className={`flex-1 text-meta ${t.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
              {t.title}
            </RT.Description>
            {t.action && (
              <RT.Action altText={t.action.label} asChild>
                <button
                  type="button"
                  onClick={t.action.onClick}
                  className="min-h-[32px] rounded-ctl px-2 text-meta font-semibold text-accent underline"
                >
                  {t.action.label}
                </button>
              </RT.Action>
            )}
            <RT.Close aria-label="Dismiss" className="grid h-8 w-8 place-items-center rounded-ctl text-muted">
              <X size={16} aria-hidden />
            </RT.Close>
          </RT.Root>
        ))}
        <RT.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-[420px] flex-col gap-2 p-4 outline-none" />
      </RT.Provider>
    </Ctx.Provider>
  );
}
