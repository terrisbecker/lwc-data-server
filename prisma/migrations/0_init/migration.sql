-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "watershed_field_data";

-- CreateTable
CREATE TABLE "camas_city_data" (
    "id" SERIAL NOT NULL,
    "location" VARCHAR(255),
    "date" DATE,
    "time" TIME(6),
    "depth" DECIMAL,
    "temp_c" DECIMAL,
    "do_percent" DECIMAL,
    "do_mg_l" DECIMAL,
    "spc_us_cm" DECIMAL,
    "c_us_cm" DECIMAL,
    "tds_mg_l" DECIMAL,
    "ph" DECIMAL,
    "chl_a_rfu" DECIMAL,
    "phyc_rfu" DECIMAL,
    "turbidity" DECIMAL,

    CONSTRAINT "camas_city_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmn_combined_field_data" (
    "id" TEXT NOT NULL,
    "sample_date" DATE,
    "sample_time" TIME(6),
    "sampling_site" TEXT,
    "air_temperature" DECIMAL,
    "weather" TEXT,
    "wind_direction" TEXT,
    "wind_speed" TEXT,
    "barometeric_pressure" DECIMAL,
    "water_temperature" DECIMAL,
    "ph" DECIMAL,
    "dissolved_oxygen" DECIMAL,
    "conductivity" DECIMAL,
    "total_dissolved_solids" DECIMAL,
    "salt_ppt" DECIMAL,
    "aphanizomenon" TEXT,
    "dolichospermum" TEXT,
    "microcystis" TEXT,
    "planktothrix" TEXT,
    "raphidiopsis" TEXT,
    "woronichinia" TEXT,
    "general_comments" TEXT,
    "secchi" DECIMAL,
    "source" TEXT,

    CONSTRAINT "pmn_combined_field_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmn_field_data" (
    "sample_date" DATE NOT NULL,
    "sample_time" TIME(6),
    "sampling_site" TEXT NOT NULL,
    "air_temperature" DECIMAL,
    "weather" TEXT,
    "wind_direction" TEXT,
    "wind_speed" TEXT,
    "barometeric_pressure" DECIMAL,
    "water_temperature" DECIMAL,
    "ph" DECIMAL,
    "dissolved_oxygen" DECIMAL,
    "conductivity" DECIMAL,
    "total_dissolved_solids" DECIMAL,
    "salt_ppt" DECIMAL,
    "aphanizomenon" TEXT,
    "dolichospermum" TEXT,
    "microcystis" TEXT,
    "planktothrix" TEXT,
    "raphidiopsis" TEXT,
    "woronichinia" TEXT,
    "general_comments" TEXT,
    "secchi" DECIMAL,
    "id_uuid" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "pmn_field_data_pkey1" PRIMARY KEY ("id_uuid")
);

-- CreateTable
CREATE TABLE "pmn_volunteer_input" (
    "id" SERIAL NOT NULL,
    "sample_date" DATE,
    "sample_time" TIME(6),
    "sampling_site" TEXT,
    "verification_code" TEXT,
    "air_temp" DECIMAL,
    "weather" TEXT,
    "wind_direction" TEXT,
    "wind_speed" TEXT,
    "baro_pressure" DECIMAL,
    "water_temp" DECIMAL,
    "ph" DECIMAL,
    "dissolved_oxygen" DECIMAL,
    "conductivity" DECIMAL,
    "total_dissolved_solids" DECIMAL,
    "salt" DECIMAL,
    "secchi" DECIMAL,
    "aphanizomenon" TEXT,
    "dolichospermum" TEXT,
    "microcystis" TEXT,
    "planktothrix" TEXT,
    "raphidiopsis" TEXT,
    "woronichinia" TEXT,
    "general_comments" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "id_uuid" UUID DEFAULT gen_random_uuid(),

    CONSTRAINT "pmn_volunteer_input_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watershed_field_data"."locations" (
    "loc_id" SERIAL NOT NULL,
    "loc_name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("loc_id")
);

-- CreateTable
CREATE TABLE "watershed_field_data"."phosphate_data" (
    "id" SERIAL NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "lab_case_file_number" INTEGER NOT NULL,
    "loc_id" INTEGER NOT NULL,
    "measurement_date" DATE NOT NULL,
    "measurement_time" TIME(6) NOT NULL,
    "analysis_date" DATE NOT NULL,
    "analyte_id" VARCHAR(50) NOT NULL,
    "analyte_level" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "phosphate_data_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "watershed_field_data"."phosphate_data" ADD CONSTRAINT "phosphate_data_loc_id_fkey" FOREIGN KEY ("loc_id") REFERENCES "watershed_field_data"."locations"("loc_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

