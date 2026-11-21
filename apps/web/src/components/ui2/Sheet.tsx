import { useId, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react';
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
  bodyClassName?: string;
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
  bodyClassName,
  footer,
  presentation = 'auto',
  contained = false,
}: SheetProps) {
  const mode = useShellMode();
  const dialog = presentation === 'dialog' || (presentation === 'auto' && mode === 'sidebar');
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragY = useRef<number | null>(null);
  // A contained sheet is a gallery frame. It must not lock page scroll or steal focus.
  useFocusTrap(open && !contained, panelRef, onClose);
  // Stays on screen for its exit: the panel slides down (a dialog shrinks) while the backdrop fades
  const { mounted, leaving } = usePresence(open, 200);
  const scrollDescription = Boolean(description && !leading && !meta);
  const hasBody = Boolean(children || scrollDescription);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // A body with overflowing prose needs its own keyboard scroll target.
    const updateTabStop = () => {
      if (body.scrollHeight > body.clientHeight) body.tabIndex = 0;
      else body.removeAttribute('tabindex');
    };
    updateTabStop();
    const observer = new ResizeObserver(updateTabStop);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, [mounted, hasBody]);

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

  const descriptionBlock = description ? (
    <p
      id={descId}
      className={cn(
        'font-semibold text-ink-muted',
        dialog && !leading ? 'text-body-s' : 'text-caption',
        scrollDescription
          ? dialog ? 'mt-1' : 'mt-0.5'
          : leading ? 'mt-0.5' : dialog ? 'mt-2' : 'mt-1.5',
      )}
    >
      {description}
    </p>
  ) : null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      className={cn(
        'flex max-h-full flex-col bg-surface text-ink shadow-sheet outline-none',
        dialog ? (leaving ? 'so-dialog-out' : 'so-dialog-in') : leaving ? 'so-sheet-out' : 'so-sheet-in',
        dialog
          ? 'w-[440px] max-w-[calc(100%-32px)] rounded-xl p-6 [@media(max-height:400px)]:py-3'
          : 'w-full rounded-2xl px-[18px] pb-[calc(16px+var(--sa-bottom))] pt-5 [@media(max-height:400px)]:pb-[calc(10px+var(--sa-bottom))] [@media(max-height:400px)]:pt-3',
      )}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="shrink-0" onPointerDown={startDrag} onPointerUp={finishDrag} onPointerCancel={() => { dragY.current = null; }}>
        {dialog ? null : <div className="mx-auto mb-3 h-1 w-9 rounded-pill bg-line-strong [@media(max-height:400px)]:mb-2" aria-hidden />}
        <div className={leading ? 'flex items-center gap-3.5' : undefined}>
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={cn('text-title', dialog ? 'font-extrabold' : 'font-bold', leading && 'truncate')}>
              {title}
            </h2>
            {scrollDescription ? null : descriptionBlock}
            {meta ? <div className="mt-1">{meta}</div> : null}
          </div>
        </div>
      </div>
      {hasBody ? (
        <div
          ref={bodyRef}
          role="region"
          aria-labelledby={titleId}
          className={cn(
            'so-focus -mx-1 -mb-1 min-h-0 overflow-y-auto overscroll-contain scroll-py-1 rounded-sm px-1 py-1 focus-visible:outline-offset-[-2px]',
            !scrollDescription && 'mt-2',
            bodyClassName,
          )}
        >
          <div>
            {scrollDescription ? descriptionBlock : null}
            {children && scrollDescription ? <div className="mt-3">{children}</div> : children}
          </div>
        </div>
      ) : null}
      {footer ? (
        // Dialog: one equal column per button across the full width, so a lone "Close" is not left at half width
        <div className={cn(
          'shrink-0 gap-2.5 [@media(max-height:400px)]:mt-2',
          dialog ? 'mt-5 grid auto-cols-fr grid-flow-col' : 'mt-4 flex flex-col',
        )}>
          {footer}
        </div>
      ) : null}
    </div>
  );

  const frame = (
    <div
      className={cn(
        'flex bg-scene/50',
        leaving ? 'so-fade-out pointer-events-none' : 'so-fade-in',
        contained ? 'absolute inset-0' : 'fixed inset-x-0 top-0 z-50 h-[100dvh]',
        dialog ? 'items-center justify-center p-4' : 'items-end p-2.5',
        !contained && (dialog
          ? 'px-[max(1rem,var(--sa-inline))] pb-[calc(1rem+var(--sa-bottom))] pt-[calc(1rem+var(--sa-top))]'
          : 'px-[max(0.625rem,var(--sa-inline))] pt-[calc(0.625rem+var(--sa-top))]'),
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
