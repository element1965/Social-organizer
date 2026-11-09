# Explainer figures

Pure SVG/React ports of `docs/redesign/mockups/v2/figures.js`. Colors come from the `--so-*` token triplets, so both
themes switch by themselves. Under `prefers-reduced-motion` they render the final state (no transitions, no moving dot).

```tsx
import { NetFigure, OrbitFigure, ChainFigure, JoinFigure, HuiFigure } from '@/components/figures';
import { useScrollPlay } from '@/lib/scrollPlay';

const [ref, depth] = useScrollPlay<HTMLDivElement, 0 | 1 | 2>([0, 1, 2], { gap: 900 });
<div ref={ref}><OrbitFigure depth={depth} /></div>
```

- `NetFigure step={0|1|2}`: rings, request path with the amount tag, chat. viewBox 320x300.
- `OrbitFigure depth={0|1|2}`: handshake rings. viewBox 440x440.
- `ChainFigure step={0|1|2}`, `JoinFigure step={0|1}`: optional `onSelect` makes people tappable. viewBox 400x110.
- `HuiFigure`: `month`/`defaultMonth`/`onMonthChange`, `playKey` (change to replay), `static`+`stage`, `size` (320 on phones).
- Every figure takes `labels` (partial); defaults are Russian (`*_LABELS_RU`). Wire i18n by passing translated strings.
