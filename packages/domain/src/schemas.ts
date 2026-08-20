import { z } from "zod";

const finiteNumber = z.number();
const positiveFinite = finiteNumber.positive();
const nonNegativeFinite = finiteNumber.nonnegative();

export const vec2Schema = z.tuple([finiteNumber, finiteNumber]);
export const poseSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  heading: finiteNumber,
});
export const polygonSchema = z.array(vec2Schema).min(3);

export const vehicleProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(["hatchback", "sedan", "suv", "mpv", "pickup", "custom"]),
    lengthM: positiveFinite,
    widthM: positiveFinite,
    wheelbaseM: positiveFinite,
    frontOverhangM: nonNegativeFinite,
    rearOverhangM: nonNegativeFinite,
    maxSteerRad: positiveFinite.max(Math.PI / 2),
    minTurnRadiusM: positiveFinite.optional(),
    trackWidthM: positiveFinite.optional(),
    manufacturer: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    generation: z.string().min(1).optional(),
    trim: z.string().min(1).optional(),
    market: z.string().min(1).optional(),
    canonicalKey: z.string().min(1).optional(),
    dataStatus: z.enum(["READY", "PARTIAL", "RESOLVING", "REVIEW_REQUIRED"]).optional(),
  })
  .strict();

const drivableAreaSchema = z.object({
  id: z.string().min(1),
  type: z.literal("drivableArea"),
  polygon: polygonSchema,
});

const polygonObstacleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["wall", "curb", "obstacle", "parkedVehicle"]),
  polygon: polygonSchema,
});

const gateSchema = z.object({
  id: z.string().min(1),
  type: z.literal("gate"),
  start: vec2Schema,
  end: vec2Schema,
  label: z.string().min(1).optional(),
});

export const sceneObjectSchema = z.discriminatedUnion("type", [
  drivableAreaSchema,
  polygonObstacleSchema,
  gateSchema,
]);

export const poseGoalSchema = z.object({
  type: z.literal("pose"),
  x: finiteNumber,
  y: finiteNumber,
  heading: finiteNumber,
  positionToleranceM: positiveFinite,
  headingToleranceRad: nonNegativeFinite.max(Math.PI),
});

export const regionGoalSchema = z.object({
  type: z.literal("region"),
  polygon: polygonSchema,
  heading: finiteNumber.optional(),
  headingToleranceRad: nonNegativeFinite.max(Math.PI).optional(),
});

export const goalSchema = z.discriminatedUnion("type", [poseGoalSchema, regionGoalSchema]);

export const sceneSchemaV1 = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    world: z.object({
      unit: z.literal("m"),
      gridSize: positiveFinite,
    }),
    objects: z.array(sceneObjectSchema),
    vehicle: z
      .object({
        profileId: z.string().min(1),
        pose: poseSchema,
      })
      .optional(),
    goal: goalSchema.optional(),
    safetyMarginM: nonNegativeFinite.optional(),
  })
  .strict();

export const sceneSchema = sceneSchemaV1;

export function parseScene(input: unknown) {
  return sceneSchema.parse(input);
}

export function serializeScene(input: unknown): string {
  return JSON.stringify(parseScene(input));
}
