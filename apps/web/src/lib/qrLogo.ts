/**
 * The brand mark in the middle of every QR code we draw.
 * The dark logo (594x420) sits on the white plate; `excavate` clears the modules under it.
 * Codes with a logo must use error correction level 'H' so they still scan with the centre covered.
 */
const LOGO_SRC = '/logo-dark.png';
const LOGO_ASPECT = 420 / 594;

export const QR_LOGO_LEVEL = 'H' as const;

/** imageSettings for qrcode.react: the logo takes about 22% of the code's width. */
export function qrLogo(size: number) {
  const width = Math.round(size * 0.22);
  return { src: LOGO_SRC, width, height: Math.round(width * LOGO_ASPECT), excavate: true };
}
