CREATE TABLE "AgentRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "responseJson" TEXT,
  "errorJson" TEXT,
  "deploymentId" TEXT,
  "siteId" TEXT,
  "paymentPayer" TEXT,
  "paymentNetwork" TEXT,
  "paymentAmount" TEXT,
  "paymentTx" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRequest_userId_idempotencyKey_key" ON "AgentRequest"("userId", "idempotencyKey");
CREATE INDEX "AgentRequest_deploymentId_idx" ON "AgentRequest"("deploymentId");
CREATE INDEX "AgentRequest_paymentPayer_paymentNetwork_idx" ON "AgentRequest"("paymentPayer", "paymentNetwork");

ALTER TABLE "AgentRequest"
  ADD CONSTRAINT "AgentRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
