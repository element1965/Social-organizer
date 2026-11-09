export function trpcCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: string } | null }).data;
  return data?.code;
}
