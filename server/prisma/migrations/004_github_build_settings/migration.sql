ALTER TABLE "GitHubConnection" ADD COLUMN "projectRoot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GitHubConnection" ADD COLUMN "buildEnv" TEXT;
