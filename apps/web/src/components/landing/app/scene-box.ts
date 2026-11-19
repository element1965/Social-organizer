/**
 * The Circle's scene on a 390 x 844 phone with the feed open (CirclePage, PhoneCircle): 84 px of tab bar, a sheet
 * of 42 % of the rest (319 px) that the scene runs 24 px under, so the scene is 465 px tall. The graph keeps names
 * out of the header (insetTop) and the ring chips (PHONE_CHIPS_INSET). The capture page and the preview share it.
 */
export const SCENE_BOX = { width: 390, height: 465, insetTop: 120, insetBottom: 148 } as const;
/** The phone screen the preview draws, in CSS px before it is scaled into the frame. */
export const PHONE_SCREEN = { width: 390, height: 844, tabBar: 84, sheet: 319 } as const;
