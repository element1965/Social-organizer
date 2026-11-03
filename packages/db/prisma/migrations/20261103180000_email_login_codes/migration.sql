-- SO-21: sign-in with a one-time e-mail code; mark e-mails whose ownership is proven.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "email_login_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_login_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_login_codes_email_createdAt_idx" ON "email_login_codes"("email", "createdAt");

-- E-mails that came from a verified Google/Apple sign-in are already proven.
UPDATE "users" u SET "emailVerifiedAt" = u."createdAt"
WHERE u."email" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "platform_accounts" p WHERE p."userId" = u."id" AND p."platform" IN ('GOOGLE', 'APPLE'));
