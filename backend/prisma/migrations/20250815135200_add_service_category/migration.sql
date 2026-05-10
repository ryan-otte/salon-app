-- CreateEnum
CREATE TYPE "public"."ServiceCategory" AS ENUM ('MENS', 'WOMENS');

-- AlterTable
ALTER TABLE "public"."Service" ADD COLUMN     "category" "public"."ServiceCategory" NOT NULL DEFAULT 'MENS';
