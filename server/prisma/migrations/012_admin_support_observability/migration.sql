-- Admin/support/observability tables

CREATE TABLE "UserLoginEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserLoginEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerErrorLog" (
  "id" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "path" TEXT,
  "method" TEXT,
  "userId" TEXT,
  "statusCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserLoginEvent_userId_idx" ON "UserLoginEvent"("userId");
CREATE INDEX "UserLoginEvent_createdAt_idx" ON "UserLoginEvent"("createdAt");
CREATE INDEX "UserLoginEvent_method_idx" ON "UserLoginEvent"("method");

CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

CREATE INDEX "ServerErrorLog_createdAt_idx" ON "ServerErrorLog"("createdAt");
CREATE INDEX "ServerErrorLog_statusCode_idx" ON "ServerErrorLog"("statusCode");
CREATE INDEX "ServerErrorLog_path_idx" ON "ServerErrorLog"("path");

ALTER TABLE "UserLoginEvent"
  ADD CONSTRAINT "UserLoginEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportTicket"
  ADD CONSTRAINT "SupportTicket_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
