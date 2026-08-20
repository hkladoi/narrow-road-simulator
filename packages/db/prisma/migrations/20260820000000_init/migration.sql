-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Enable indexed fuzzy/substring search for normalized vehicle names and aliases.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('HATCHBACK', 'SEDAN', 'SUV', 'MPV', 'PICKUP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VehicleDataStatus" AS ENUM ('READY', 'PARTIAL', 'RESOLVING', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('DIRECT', 'DERIVED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "ResolveJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanningRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vehicle_profiles" (
    "id" UUID NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generation" TEXT,
    "trim" TEXT,
    "model_year" INTEGER,
    "market" TEXT,
    "display_name" TEXT NOT NULL,
    "search_text_normalized" TEXT NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "status" "VehicleDataStatus" NOT NULL,
    "length_m" DOUBLE PRECISION,
    "width_m" DOUBLE PRECISION,
    "wheelbase_m" DOUBLE PRECISION,
    "front_overhang_m" DOUBLE PRECISION,
    "rear_overhang_m" DOUBLE PRECISION,
    "max_steer_rad" DOUBLE PRECISION,
    "min_turn_radius_m" DOUBLE PRECISION,
    "track_width_m" DOUBLE PRECISION,
    "confidence_score" DOUBLE PRECISION,
    "data_version" INTEGER NOT NULL DEFAULT 1,
    "last_verified_at" TIMESTAMP(3),
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_aliases" (
    "id" UUID NOT NULL,
    "vehicle_profile_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_normalized" TEXT NOT NULL,
    "alias_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_spec_sources" (
    "id" UUID NOT NULL,
    "vehicle_profile_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "value_raw" TEXT NOT NULL,
    "value_normalized" DOUBLE PRECISION,
    "unit_raw" TEXT,
    "source_url" TEXT NOT NULL,
    "source_title" TEXT NOT NULL,
    "source_domain" TEXT,
    "source_type" "EvidenceSourceType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "formula" TEXT,
    "formula_inputs" JSONB,
    "retrieved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_spec_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_search_cache" (
    "id" UUID NOT NULL,
    "query_normalized" TEXT NOT NULL,
    "result_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_search_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_resolve_jobs" (
    "id" UUID NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "status" "ResolveJobStatus" NOT NULL,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_resolve_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_templates" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scene_json" JSONB NOT NULL,
    "default_vehicle_profile_id" UUID,
    "is_builtin" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scene_json" JSONB NOT NULL,
    "vehicle_profile_json" JSONB,
    "start_pose_json" JSONB,
    "goal_json" JSONB,
    "safety_margin_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_runs" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "planner_version" TEXT NOT NULL,
    "settings_json" JSONB NOT NULL,
    "status" "PlanningRunStatus" NOT NULL,
    "result_json" JSONB,
    "runtime_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_profiles_canonical_key_key" ON "vehicle_profiles"("canonical_key");

-- CreateIndex
CREATE INDEX "vehicle_profiles_manufacturer_model_idx" ON "vehicle_profiles"("manufacturer", "model");

-- CreateIndex
CREATE INDEX "vehicle_profiles_status_idx" ON "vehicle_profiles"("status");

-- Trigram indexes back DB-first partial searches such as "5", "vf5", and "ex5".
CREATE INDEX "vehicle_profiles_search_text_trgm_idx"
ON "vehicle_profiles" USING GIN ("search_text_normalized" gin_trgm_ops);

CREATE INDEX "vehicle_profiles_display_name_trgm_idx"
ON "vehicle_profiles" USING GIN ("display_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "vehicle_aliases_alias_normalized_idx" ON "vehicle_aliases"("alias_normalized");

CREATE INDEX "vehicle_aliases_alias_normalized_trgm_idx"
ON "vehicle_aliases" USING GIN ("alias_normalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_aliases_vehicle_profile_id_alias_normalized_key" ON "vehicle_aliases"("vehicle_profile_id", "alias_normalized");

-- CreateIndex
CREATE INDEX "vehicle_spec_sources_vehicle_profile_id_field_name_idx" ON "vehicle_spec_sources"("vehicle_profile_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_search_cache_query_normalized_key" ON "vehicle_search_cache"("query_normalized");

-- CreateIndex
CREATE INDEX "vehicle_search_cache_expires_at_idx" ON "vehicle_search_cache"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_resolve_jobs_canonical_key_key" ON "vehicle_resolve_jobs"("canonical_key");

-- CreateIndex
CREATE INDEX "vehicle_resolve_jobs_status_idx" ON "vehicle_resolve_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_templates_slug_key" ON "scenario_templates"("slug");

-- CreateIndex
CREATE INDEX "scenarios_updated_at_idx" ON "scenarios"("updated_at");

-- CreateIndex
CREATE INDEX "planning_runs_scenario_id_created_at_idx" ON "planning_runs"("scenario_id", "created_at");

-- AddForeignKey
ALTER TABLE "vehicle_aliases" ADD CONSTRAINT "vehicle_aliases_vehicle_profile_id_fkey" FOREIGN KEY ("vehicle_profile_id") REFERENCES "vehicle_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_spec_sources" ADD CONSTRAINT "vehicle_spec_sources_vehicle_profile_id_fkey" FOREIGN KEY ("vehicle_profile_id") REFERENCES "vehicle_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_templates" ADD CONSTRAINT "scenario_templates_default_vehicle_profile_id_fkey" FOREIGN KEY ("default_vehicle_profile_id") REFERENCES "vehicle_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants retained at the database boundary.
ALTER TABLE "vehicle_profiles" ADD CONSTRAINT "vehicle_profiles_dimensions_check" CHECK (
  ("length_m" IS NULL OR "length_m" > 0) AND
  ("width_m" IS NULL OR "width_m" > 0) AND
  ("wheelbase_m" IS NULL OR "wheelbase_m" > 0) AND
  ("front_overhang_m" IS NULL OR "front_overhang_m" >= 0) AND
  ("rear_overhang_m" IS NULL OR "rear_overhang_m" >= 0) AND
  ("max_steer_rad" IS NULL OR ("max_steer_rad" > 0 AND "max_steer_rad" < pi() / 2)) AND
  ("track_width_m" IS NULL OR "track_width_m" > 0) AND
  ("confidence_score" IS NULL OR "confidence_score" BETWEEN 0 AND 1) AND
  "data_version" >= 1
);

ALTER TABLE "vehicle_profiles" ADD CONSTRAINT "vehicle_profiles_ready_fields_check" CHECK (
  "status" <> 'READY' OR (
    "length_m" IS NOT NULL AND
    "width_m" IS NOT NULL AND
    "wheelbase_m" IS NOT NULL AND
    "front_overhang_m" IS NOT NULL AND
    "rear_overhang_m" IS NOT NULL AND
    "max_steer_rad" IS NOT NULL
  )
);

ALTER TABLE "vehicle_aliases" ADD CONSTRAINT "vehicle_aliases_normalized_not_empty_check"
CHECK (length("alias_normalized") > 0);

ALTER TABLE "vehicle_spec_sources" ADD CONSTRAINT "vehicle_spec_sources_confidence_check"
CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_safety_margin_check"
CHECK ("safety_margin_m" >= 0);
