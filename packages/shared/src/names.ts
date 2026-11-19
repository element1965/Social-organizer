/** The first word of a full name ("Anna Petrova" → "Anna"). */
export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

/**
 * The invited person's name in a shared invite address (`?to=Vanya`), for "Vanya, Anna invites you…".
 * It lives only in the address the inviter shared: never stored, never shown to anyone else.
 * Letters, spaces, "-", "'" and ".", up to 40 characters; anything else is dropped.
 */
export function safeAddressee(raw: string | null | undefined): string | null {
  const v = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!v || v.length > 40 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(v)) return null;
  return v;
}
