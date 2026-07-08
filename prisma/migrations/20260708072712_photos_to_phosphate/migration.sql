/*
  Warnings:

  - You are about to drop the column `lab_id` on the `phosphate_data` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "watershed_field_data"."phosphate_data" DROP COLUMN "lab_id",
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];
