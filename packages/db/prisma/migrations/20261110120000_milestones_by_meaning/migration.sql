-- Milestones follow what actually changes for a person: the Need tab opens, the first Need, the first Participation.
-- TEN_CONNECTIONS stays in the type for old rows.
ALTER TYPE "MilestoneKind" ADD VALUE IF NOT EXISTS 'NEED_UNLOCKED';
ALTER TYPE "MilestoneKind" ADD VALUE IF NOT EXISTS 'FIRST_NEED';
ALTER TYPE "MilestoneKind" ADD VALUE IF NOT EXISTS 'FIRST_PARTICIPATION';
