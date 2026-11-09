import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Custom font sizes (`text-body-l`, `text-h1`, …) share the `text-` prefix with
 * colour utilities. tailwind-merge otherwise treats the size as a colour and
 * drops `text-care-on` / `text-canvas`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'title',
            'body-l',
            'body',
            'body-s',
            'caption',
            'label',
            'micro',
            'tab',
          ],
        },
      ],
      'text-color': [
        {
          text: [
            'canvas',
            'surface',
            'surface-2',
            'ink',
            'ink-muted',
            'ink-subtle',
            'line',
            'line-soft',
            'line-strong',
            'care',
            'care-hover',
            'care-soft',
            'care-on',
            'care-bright',
            'care-scene',
            'link',
            'link-soft',
            'sos',
            'sos-hover',
            'sos-soft',
            'sos-on',
            'warm',
            'warm-soft',
            'warm-ink',
            'scene',
            'scene-2',
            'scene-3',
            'node-1',
            'node-2',
            'node-3',
            'success',
            'warning',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
