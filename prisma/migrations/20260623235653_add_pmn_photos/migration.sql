/*
  Warnings:

  - The primary key for the `pmn_combined_field_data` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `source` on the `pmn_combined_field_data` table. All the data in the column will be lost.
  - Changed the type of `id` on the `pmn_combined_field_data` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "pmn"."pmn_combined_field_data" DROP CONSTRAINT "pmn_combined_field_data_pkey",
DROP COLUMN "source",
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "pmn_combined_field_data_pkey" PRIMARY KEY ("id");
