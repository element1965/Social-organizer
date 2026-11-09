import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { useFocusTrap } from './focus-trap';
import { useShellMode } from './shell-mode';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** auto follows the shell: dialog from 1024, sheet below that and on phone shells. */
  presentation?: 'auto' | 'sheet' | 'dialog';
  /** Stay inside a relative parent. Used by the gallery so each theme can show one. */
  contained?: boolean;
};

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  presentation = 'auto',
  contained = false,
}: SheetProps) {
  const mode = useShellMode();
  const dialog = presentation === 'dialog' || (presentation === 'auto' && mode === 'sidebar');
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // A contained sheet is a gallery frame. It must not lock page scroll or steal focus.
  useFocusTrap(open && !contained, panelRef, onClose);

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      className={cn(
        'so-sheet-in bg-surface text-ink shadow-sheet outline-none',
        dialog
          ? 'w-[440px] max-w-[calc(100%-32px)] rounded-r-xl p-6'
          : 'w-full rounded-r-2xl px-[18px] pb-[calc(16px+var(--sa-bottom))] pt-5',
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <h2 id={titleId} className={cn('text-title', dialog ? 'font-extrabold' : 'font-bold')}>
        {title}
      </h2>
      {description ? (
        <p id={descId} className="mt-1.5 text-caption font-semibold text-ink-muted">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
      {footer ? (
        <div className={cn('mt-4', dialog ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5')}>{footer}</div>
      ) : null}
    </div>
  );

  const frame = (
    <div
      className={cn(
        'flex bg-scene/50',
        contained ? 'absolute inset-0' : 'fixed inset-0 z-50',
        dialog ? 'items-center justify-center p-4' : 'items-end p-2.5',
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panel}
    </div>
  );

  if (contained || typeof document === 'undefined') return frame;
  return createPortal(frame, document.body);
}
