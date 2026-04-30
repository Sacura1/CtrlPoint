-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "githubId" TEXT,
    "githubToken" TEXT,
    "githubTokenIv" TEXT,
    "massaAddress" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mnsName" TEXT NOT NULL,
    "scAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedCode" TEXT NOT NULL,
    "previousCode" TEXT,
    "lastPrompt" TEXT,
    "title" TEXT NOT NULL DEFAULT 'My Site',
    "description" TEXT NOT NULL DEFAULT '',
    "needsDeploy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INITIAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "source" TEXT NOT NULL DEFAULT 'agent',
    "commitSha" TEXT,
    "step" TEXT,
    "errorMsg" TEXT,
    "scAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubConnection" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubInstallationId" TEXT,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "projectType" TEXT NOT NULL DEFAULT 'static',
    "buildCommand" TEXT NOT NULL DEFAULT 'npm run build',
    "outputDir" TEXT NOT NULL DEFAULT 'dist',
    "lastDeployedSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT,
    "accountType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_mnsName_key" ON "Site"("mnsName");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_siteId_key" ON "GitHubConnection"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_userId_provider_key" ON "UserApiKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
