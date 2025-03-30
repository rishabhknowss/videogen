/*
  Warnings:

  - You are about to drop the column `brollImages` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `brollVideoUrl` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `keywords` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "brollImages",
DROP COLUMN "brollVideoUrl",
DROP COLUMN "keywords",
ADD COLUMN     "generatedImages" TEXT[],
ADD COLUMN     "imagePrompts" TEXT[],
ADD COLUMN     "scenes" TEXT;
