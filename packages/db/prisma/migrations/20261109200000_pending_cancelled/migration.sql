-- A withdrawn acquaintance request is kept (not deleted) so a new one to the same person waits out a cooldown
ALTER TYPE "PendingConnectionStatus" ADD VALUE 'CANCELLED';
