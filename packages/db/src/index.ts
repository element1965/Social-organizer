export { PrismaClient, Prisma } from "@prisma/client";
export type * from "@prisma/client";

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

export function getDb(): PrismaClient {
  if (!prisma) {
    // The password hash never leaves the database by accident: queries that need it
    // (password sign-in, account linking) ask for it with `omit: { passwordHash: false }`.
    prisma = new PrismaClient({ omit: { user: { passwordHash: true } } }) as unknown as PrismaClient;
  }
  return prisma;
}
