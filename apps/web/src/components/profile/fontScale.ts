const STORAGE_KEY = 'so.fontScale';

/** Apply a font scale (1 = default, 1.25 = large) on the document root and remember it. */
export function applyFontScale(scale: number) {
  const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
  document.documentElement.style.fontSize = `${safe * 100}%`;
  try {
    localStorage.setItem(STORAGE_KEY, String(safe));
  } catch {
    /* storage unavailable */
  }
}

export function applyStoredFontScale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const scale = Number(raw);
    if (Number.isFinite(scale) && scale > 0) applyFontScale(scale);
  } catch {
    /* storage unavailable */
  }
}

applyStoredFontScale();
