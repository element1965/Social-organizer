/** Dark v2 scene tokens. The planet stays this dark in both app themes. */
export interface GraphColors {
  scene: string;
  node1: string;
  node2: string;
  node3: string;
  /** Rings, path links, path labels. Token `care-scene`. */
  care: string;
  /** Path nodes and the centre tile. Token `care-bright`. */
  careBright: string;
  /** Mark tint on the care tile. White on-care: the tile is care-bright, and the scene does not follow the app theme. */
  careOn: string;
  line: string;
  star: string;
  label: string;
}

export const GRAPH_COLORS: GraphColors = {
  scene: '#0b1513',
  node1: '#e7eeeb',
  node2: '#9fb0aa',
  node3: '#5f7069',
  care: '#5fd3c6',
  careBright: '#0d9488',
  careOn: '#ffffff',
  line: 'rgba(231,238,235,0.16)',
  star: 'rgba(231,238,235,0.9)',
  label: '#e7eeeb',
};

/** Tooltip card. `theme` changes only these. */
export interface OverlayColors {
  surface: string;
  ink: string;
  muted: string;
  line: string;
  care: string;
}

export const OVERLAY_DARK: OverlayColors = {
  surface: '#1c2622',
  ink: '#e7eeeb',
  muted: '#93a59f',
  line: 'rgba(231,238,235,0.14)',
  care: '#2bb3a4',
};

export const OVERLAY_LIGHT: OverlayColors = {
  surface: '#ffffff',
  ink: '#14211e',
  muted: '#5c6d68',
  line: 'rgba(20,33,30,0.14)',
  care: '#087f71',
};

export function resolveColors(partial?: Partial<GraphColors> | null): GraphColors {
  if (!partial) return GRAPH_COLORS;
  const out: GraphColors = { ...GRAPH_COLORS };
  (Object.keys(GRAPH_COLORS) as (keyof GraphColors)[]).forEach((key) => {
    const value = partial[key];
    if (typeof value === 'string' && value) out[key] = value;
  });
  return out;
}

export function overlayColors(theme: 'light' | 'dark'): OverlayColors {
  return theme === 'light' ? OVERLAY_LIGHT : OVERLAY_DARK;
}

export function parseColor(input: string): { color: number; opacity: number } {
  const rgba = input.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgba) {
    const r = Number(rgba[1] ?? 255);
    const g = Number(rgba[2] ?? 255);
    const b = Number(rgba[3] ?? 255);
    const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;
    return {
      color: ((r & 255) << 16) | ((g & 255) << 8) | (b & 255),
      opacity: Number.isFinite(a) ? a : 1,
    };
  }
  let hex = input.trim().replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = Number.parseInt(hex.slice(0, 6), 16);
  return { color: Number.isFinite(n) ? n : 0xffffff, opacity: 1 };
}

export function withAlpha(input: string, alpha: number): string {
  const { color } = parseColor(input);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

/** Link colour. A bare hex is treated as a thin low-alpha line, matching the mockup. */
export function lineColor(input: string, dim: boolean): string {
  const parsed = parseColor(input);
  const base = parsed.opacity < 0.999 ? parsed.opacity : 0.16;
  return withAlpha(input, base * (dim ? 0.35 : 1));
}

export function depthColor(colors: GraphColors, depth: number): string {
  if (depth <= 1) return colors.node1;
  if (depth === 2) return colors.node2;
  return colors.node3;
}

export function colorsKey(partial?: Partial<GraphColors> | null): string {
  if (!partial) return '';
  return (Object.keys(GRAPH_COLORS) as (keyof GraphColors)[]).map((key) => partial[key] ?? '').join('|');
}
