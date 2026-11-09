import { useEffect, useRef, type RefObject } from 'react';

const SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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

    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = items();
      const head = list[0];
      const last = list[list.length - 1];
      if (!head || !last) {
        event.preventDefault();
        return;
      }
      const index = document.activeElement instanceof HTMLElement ? list.indexOf(document.activeElement) : -1;
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && index === list.length - 1) {
        event.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previously?.focus();
    };
  }, [active, ref]);
}
