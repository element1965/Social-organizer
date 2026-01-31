export { PrismaClient } from "@prisma/client";
export type * from "@prisma/client";

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
