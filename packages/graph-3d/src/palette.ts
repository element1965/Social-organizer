/** Scene colours. `GRAPH_COLORS` is the dark scene, `GRAPH_COLORS_LIGHT` the one for the light app theme. */
export interface GraphColors {
  scene: string;
  node1: string;
  node2: string;
  node3: string;
  /** Rings, path links, pulses. Token `care-scene`. */
  care: string;
  /** Names of the people on a highlighted path: care, dark enough for text (4.5:1) on the scene. */
  careText: string;
  /** Links between me and my 1st handshake: care with its alpha. */
  spoke: string;
  /** Path nodes and the centre tile. Token `care-bright`. */
  careBright: string;
  /** Mark tint on the care tile. White on-care: the tile is care-bright, and the scene does not follow the app theme. */
  careOn: string;
  line: string;
  star: string;
  label: string;
  /** Centre wash behind the ball: inner and outer colour of the radial glow. */
  wash: string;
  washEdge: string;
}

export const GRAPH_COLORS: GraphColors = {
  scene: '#0b1513',
  node1: '#e7eeeb',
  node2: '#9fb0aa',
  node3: '#5f7069',
  care: '#5fd3c6',
  careText: '#5fd3c6',
  // care at 0.95 × 0.75: the spokes step back a little from the path links
  spoke: 'rgba(95,211,198,0.7125)',
  careBright: '#0d9488',
  careOn: '#ffffff',
  line: 'rgba(231,238,235,0.16)',
  star: 'rgba(231,238,235,0.9)',
  label: '#e7eeeb',
  wash: '#1b332e',
  washEdge: '#132420',
};

/**
 * Light theme: the pale scene of `.scene-follows-theme` (tokens.css), solid ink dots that step back by ring,
 * ink names, the light care teal. Measured on the scene (#eef3f1) and on the white centre wash, WCAG ratios:
 * dots 1st 14.8 / 2nd 6.5 / 3rd 3.3, spokes and path links 4.0, plain links 1.6 (structure, as in the dark
 * scene's 1.5), names 14.8, path names 6.0.
 */
export const GRAPH_COLORS_LIGHT: GraphColors = {
  scene: '#eef3f1', // --scene (light scene)
  node1: '#14211e', // --node-1 (light scene) = --ink
  node2: '#4a5a55', // --node-2 (light scene): the same grey as the "2nd" chip
  // 40% --ink-muted (#5c6d68) + 60% --node-3 (light scene, #8a9a95): --node-3 itself is 2.6:1 on the scene
  node3: '#788883',
  care: '#087f71', // --care
  careText: '#08675c', // --care-hover: --care is 4.4:1 on the scene, under 4.5:1 for text
  spoke: 'rgba(8,127,113,0.95)', // --care, as opaque as the path links (at 0.71 it fell to 2.8:1)
  careBright: '#0d9488',
  careOn: '#ffffff',
  line: 'rgba(20,33,30,0.24)', // --line-strong
  star: 'rgba(20,33,30,0.3)',
  label: '#14211e', // --ink
  wash: '#ffffff',
  washEdge: '#f7faf9',
};

/**
 * Dot opacity by handshake (1st, 2nd, 3rd and further). In the dark scene the far rings fade into the dark;
 * the light scene keeps its dots solid and steps back by colour, because a translucent grey dot on a pale
 * ground falls under 3:1 (the 2nd ring was 1.9:1, the 3rd 1.2:1).
 */
const DEPTH_ALPHA_DARK = [1, 0.62, 0.42] as const;
const DEPTH_ALPHA_LIGHT = [1, 1, 1] as const;

export function depthAlpha(sceneTheme: 'light' | 'dark', depth: number): number {
  const table = sceneTheme === 'light' ? DEPTH_ALPHA_LIGHT : DEPTH_ALPHA_DARK;
  return depth <= 1 ? table[0] : depth === 2 ? table[1] : table[2];
}

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
