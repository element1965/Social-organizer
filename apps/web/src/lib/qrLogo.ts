/**
 * The brand mark in the middle of every QR code we draw.
 * The same tile used by the web icon sits on the white plate. Excavation clears the modules under it.
 * Codes with a logo must use error correction level 'H' so they still scan with the centre covered.
 */
const LOGO_SRC = '/icon-192.png';

export const QR_LOGO_LEVEL = 'H' as const;

/** Keep the excavated area close to that of the previous wider logo. */
export function qrLogo(size: number) {
  const markSize = Math.round(size * 0.18);
  return { src: LOGO_SRC, width: markSize, height: markSize, excavate: true };
}
