/** Resolve landing tokens before drawing, since Canvas gradients have no CSS variable scope. */
export function landingCanvasPalette(element: HTMLElement) {
  const style = getComputedStyle(element);
  return (name: string) => style.getPropertyValue(`--lv-${name}-rgb`).trim();
}

export function canvasRgb(channels: string, alpha: number | string = 1): string {
  return `rgb(${channels} / ${alpha})`;
}
