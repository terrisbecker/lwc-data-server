-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "camas";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pmn";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "users";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "watershed_field_data";

-- CreateTable
CREATE TABLE "pmn"."pmn_combined_field_data" (
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
CREATE TABLE "camas"."camas_city_data" (
    "id" UUID NOT NULL,
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
CREATE TABLE "watershed_field_data"."locations" (
    "loc_id" UUID NOT NULL,
    "loc_name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" TEXT,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("loc_id")
);

-- CreateTable
CREATE TABLE "watershed_field_data"."phosphate_data" (
    "id" UUID NOT NULL,
    "lab_id" INTEGER NOT NULL,
    "lab_case_file_number" INTEGER NOT NULL,
    "loc_id" UUID NOT NULL,
    "measurement_date" DATE NOT NULL,
    "measurement_time" TIME(6) NOT NULL,
    "analysis_date" DATE NOT NULL,
    "analyte_id" VARCHAR(50) NOT NULL,
    "analyte_level" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "phosphate_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."permissions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "users"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "users"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "users"."permissions"("name");

-- AddForeignKey
ALTER TABLE "watershed_field_data"."phosphate_data" ADD CONSTRAINT "phosphate_data_loc_id_fkey" FOREIGN KEY ("loc_id") REFERENCES "watershed_field_data"."locations"("loc_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "users"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "users"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "users"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

