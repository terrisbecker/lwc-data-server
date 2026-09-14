-- AlterTable
ALTER TABLE "pmn"."pmn_combined_field_data" ADD COLUMN     "has_scum" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scum_photos" TEXT[] DEFAULT ARRAY[]::TEXT[];
