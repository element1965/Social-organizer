import { useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { useFocusTrap } from './focus-trap';
import { usePresence } from './presence';
import { useShellMode } from './shell-mode';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Shown left of the title (an avatar), so a person's sheet does not spend a row on it. */
  leading?: ReactNode;
  /** A short line under the description, inside the header. */
  meta?: ReactNode;
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
  leading,
  meta,
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
  const dragY = useRef<number | null>(null);
  // A contained sheet is a gallery frame. It must not lock page scroll or steal focus.
  useFocusTrap(open && !contained, panelRef, onClose);
  // Stays on screen for its exit: the panel slides down (a dialog shrinks) while the backdrop fades
  const { mounted, leaving } = usePresence(open, 200);

  if (!mounted) return null;

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dialog || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select, [role="slider"]')) return;
    dragY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragY.current != null && event.clientY - dragY.current > 48) onClose();
    dragY.current = null;
  };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      className={cn(
        'bg-surface text-ink shadow-sheet outline-none',
        dialog ? (leaving ? 'so-dialog-out' : 'so-dialog-in') : leaving ? 'so-sheet-out' : 'so-sheet-in',
        dialog
          ? 'w-[440px] max-w-[calc(100%-32px)] rounded-xl p-6'
          : 'w-full rounded-2xl px-[18px] pb-[calc(16px+var(--sa-bottom))] pt-5',
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div onPointerDown={startDrag} onPointerUp={finishDrag} onPointerCancel={() => { dragY.current = null; }}>
        {dialog ? null : <div className="mx-auto mb-3 h-1 w-9 rounded-pill bg-line-strong" aria-hidden />}
        <div className={leading ? 'flex items-center gap-3.5' : undefined}>
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={cn('text-title', dialog ? 'font-extrabold' : 'font-bold', leading && 'truncate')}>
              {title}
            </h2>
            {description ? (
              <p
                id={descId}
                className={cn(
                  'font-semibold text-ink-muted',
                  // A dialog is read, not glanced at: body size
                  dialog && !leading ? 'mt-2 text-body-s' : 'text-caption',
                  leading ? 'mt-0.5' : dialog ? null : 'mt-1.5',
                )}
              >
                {description}
              </p>
            ) : null}
            {meta ? <div className="mt-1">{meta}</div> : null}
          </div>
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
      {footer ? (
        // Dialog: one equal column per button across the full width, so a lone "Close" is not left at half width
        <div className={cn(dialog ? 'mt-5 grid auto-cols-fr grid-flow-col gap-2.5' : 'mt-4 flex flex-col gap-2.5')}>{footer}</div>
      ) : null}
    </div>
  );

  const frame = (
    <div
      className={cn(
        'flex bg-scene/50',
        leaving ? 'so-fade-out pointer-events-none' : 'so-fade-in',
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
