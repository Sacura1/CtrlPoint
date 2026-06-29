CREATE TABLE "CustomDomain" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT NOT NULL,
  "lastCheckedAt" TIMESTAMP(3),
  "errorMsg" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");
CREATE INDEX "CustomDomain_siteId_idx" ON "CustomDomain"("siteId");
CREATE INDEX "CustomDomain_status_idx" ON "CustomDomain"("status");

ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
