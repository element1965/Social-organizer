import { TRPCError } from '@trpc/server';
import { z } from 'zod';

/**
 * Network queries the app keeps per account (the network figure, the network stats, the request gate) name the
 * account they were asked for. A request that reaches the server with another session's token (the person
 * switched accounts in place while it was in flight) is refused, so its answer can never be shown or saved
 * under the wrong account. Older app versions send no input and are answered as before.
 */
export const accountScope = z.object({ account: z.string().min(1).max(64) }).optional();

export function assertAccount(userId: string, input: z.infer<typeof accountScope>): void {
  if (input?.account && input.account !== userId) {
    throw new TRPCError({ code: 'CONFLICT', message: 'ACCOUNT_CHANGED' });
  }
}
