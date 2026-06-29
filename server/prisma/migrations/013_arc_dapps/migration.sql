CREATE TABLE "ArcDapp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'FRONTEND_ONLY',
  "ownerAddress" TEXT,
  "contractAddress" TEXT,
  "deployTxHash" TEXT,
  "explorerUrl" TEXT,
  "abiJson" TEXT,
  "sourceCode" TEXT,
  "template" TEXT,
  "errorMsg" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ArcDapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArcDapp_siteId_key" ON "ArcDapp"("siteId");
CREATE INDEX "ArcDapp_userId_idx" ON "ArcDapp"("userId");
CREATE INDEX "ArcDapp_category_idx" ON "ArcDapp"("category");
CREATE INDEX "ArcDapp_status_idx" ON "ArcDapp"("status");

ALTER TABLE "ArcDapp" ADD CONSTRAINT "ArcDapp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArcDapp" ADD CONSTRAINT "ArcDapp_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
