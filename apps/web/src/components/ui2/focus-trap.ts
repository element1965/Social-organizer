import { useEffect, useRef, type RefObject } from 'react';

const SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let scrollLocks = 0;

function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = '';
}

export function useFocusTrap(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previously = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const items = () =>
      Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => !el.hasAttribute('disabled'));

    const list = items();
    const first = list[0];
    if (first) {
      first.focus();
    } else {
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
      root.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = items();
      const head = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!head || !last) {
        event.preventDefault();
        return;
      }
      const index = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1;
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    lockScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      previously?.focus();
    };
  }, [active, ref]);
}
