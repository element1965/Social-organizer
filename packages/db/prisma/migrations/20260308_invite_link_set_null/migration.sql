-- AlterTable: InviteLink.usedById — set null on user delete
ALTER TABLE "invite_links" DROP CONSTRAINT IF EXISTS "invite_links_usedById_fkey";
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
