ALTER TABLE "Site"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'WEBSITE';

ALTER TABLE "ArcDapp"
ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '',
ADD COLUMN "model" TEXT,
ADD COLUMN "reasoningEffort" TEXT,
ADD COLUMN "buildStep" TEXT,
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ownerNonce" TEXT,
ADD COLUMN "contractName" TEXT,
ADD COLUMN "contractSummary" TEXT,
ADD COLUMN "compilerVersion" TEXT,
ADD COLUMN "buildStartedAt" TIMESTAMP(3),
ADD COLUMN "buildFinishedAt" TIMESTAMP(3);

ALTER TABLE "ArcDapp"
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

ALTER TABLE "ArcDapp"
ALTER COLUMN "prompt" DROP DEFAULT;

UPDATE "Site"
SET "kind" = 'ARC_DAPP'
WHERE "id" IN (SELECT "siteId" FROM "ArcDapp");

CREATE INDEX "Site_userId_kind_idx" ON "Site"("userId", "kind");
