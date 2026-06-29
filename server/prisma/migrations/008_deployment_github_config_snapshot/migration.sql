ALTER TABLE "Deployment" ADD COLUMN "projectType" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "projectRoot" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "buildCommand" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "outputDir" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "buildEnv" TEXT;
