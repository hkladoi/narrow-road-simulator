import { BUILT_IN_SCENARIO_TEMPLATES } from "@nrs/domain";
import { normalizeVehicleText, searchTextForProfile } from "@nrs/vehicle-catalog";
import { BUILT_IN_VEHICLE_PROFILES } from "@nrs/vehicle-model";

import { createDbClient } from "../src/client";
import { VehicleCategory, VehicleDataStatus } from "../src/generated/prisma/client";

const prisma = createDbClient();

async function main() {
  const defaultProfile = BUILT_IN_VEHICLE_PROFILES[0];
  if (!defaultProfile) throw new Error("Built-in vehicle profiles are required for seeding.");
  for (const profile of BUILT_IN_VEHICLE_PROFILES) {
    const canonicalKey = `builtin:${normalizeVehicleText(profile.name)}`;
    const aliases = [profile.name, profile.category];
    await prisma.vehicleProfile.upsert({
      where: { canonicalKey },
      create: {
        canonicalKey,
        manufacturer: "Generic",
        model: profile.name,
        displayName: profile.name,
        searchTextNormalized: searchTextForProfile(profile, aliases),
        category: VehicleCategory[profile.category.toUpperCase() as keyof typeof VehicleCategory],
        status: VehicleDataStatus.READY,
        lengthM: profile.lengthM,
        widthM: profile.widthM,
        wheelbaseM: profile.wheelbaseM,
        frontOverhangM: profile.frontOverhangM,
        rearOverhangM: profile.rearOverhangM,
        maxSteerRad: profile.maxSteerRad,
        minTurnRadiusM: profile.minTurnRadiusM ?? null,
        trackWidthM: profile.trackWidthM ?? null,
        isBuiltin: true,
        aliases: {
          createMany: {
            data: aliases.map((alias) => ({ alias, aliasNormalized: normalizeVehicleText(alias) })),
            skipDuplicates: true,
          },
        },
      },
      update: {
        lengthM: profile.lengthM,
        widthM: profile.widthM,
        wheelbaseM: profile.wheelbaseM,
        frontOverhangM: profile.frontOverhangM,
        rearOverhangM: profile.rearOverhangM,
        maxSteerRad: profile.maxSteerRad,
        minTurnRadiusM: profile.minTurnRadiusM ?? null,
        trackWidthM: profile.trackWidthM ?? null,
        status: VehicleDataStatus.READY,
      },
    });
  }

  const persistedDefault = await prisma.vehicleProfile.findUniqueOrThrow({
    where: { canonicalKey: `builtin:${normalizeVehicleText(defaultProfile.name)}` },
  });
  for (const template of BUILT_IN_SCENARIO_TEMPLATES) {
    await prisma.scenarioTemplate.upsert({
      where: { slug: template.slug },
      create: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        sceneJson: template.scene,
        defaultVehicleProfileId: persistedDefault.id,
        isBuiltin: true,
      },
      update: {
        name: template.name,
        description: template.description,
        sceneJson: template.scene,
        defaultVehicleProfileId: persistedDefault.id,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
