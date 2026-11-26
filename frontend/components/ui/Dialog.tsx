'use client';
import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

/**
 * The element focused before any dialog opened. Dialogs that load data first show a skeleton dialog
 * and then mount the real one, so Radix's own "return focus" would point inside the skeleton (gone by
 * then). Tracking the last focus outside every dialog returns focus to the button that opened it.
 */
let outsideFocus: HTMLElement | null = null;
const OPEN_DIALOG = '[role="dialog"][data-state="open"]';

function rememberOutsideFocus() {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && !el.closest('[role="dialog"]')) outsideFocus = el;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Rendered as a <form> so Enter submits and footer buttons can be type="submit". */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function Dialog({ open, onOpenChange, title, children, footer, wide, onSubmit }: Props) {
  const Body = (onSubmit ? 'form' : 'div') as 'form';
  const returnTo = useRef<HTMLElement | null>(null);
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-[fade_120ms_ease-out]" />
        <RD.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            rememberOutsideFocus();
            returnTo.current = outsideFocus;
          }}
          onCloseAutoFocus={(e) => {
            // Also runs on unmount. Another dialog took over (skeleton â†’ form): leave focus to it.
            if (document.querySelector(OPEN_DIALOG)) {
              e.preventDefault();
              return;
            }
            const el = returnTo.current ?? outsideFocus; // the form dialog may mount after the skeleton took the open event
            if (el?.isConnected) {
              e.preventDefault();
              el.focus();
            }
          }}
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-dialog border border-line bg-panel shadow-2xl ${
            wide ? 'max-w-[680px]' : 'max-w-[560px]'
          }`}
        >
          <Body onSubmit={onSubmit} noValidate={onSubmit ? true : undefined} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <RD.Title className="text-[17px] font-semibold">{title}</RD.Title>
              <RD.Close aria-label="Close" className="grid h-9 w-9 place-items-center rounded-ctl text-muted hover:bg-sunk">
                <X size={18} aria-hidden />
              </RD.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>
            )}
          </Body>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
