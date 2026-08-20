import type { VehicleProfile } from "@nrs/domain";
import { validateVehicleProfile } from "@nrs/vehicle-model";

import type {
  BraveResolvedVehicle,
  ResolvedVehicleProfile,
  VehicleCandidate,
  VehicleSpecEvidence,
} from "./contracts";
import {
  canonicalizeVehicleCandidate,
  evidenceByField,
  normalizeEvidence,
  normalizeVehicleText,
} from "./normalization";

function deriveSteeringEvidence(
  wheelbaseM: number,
  minTurnRadiusM: number,
  source: VehicleSpecEvidence,
): VehicleSpecEvidence {
  return {
    fieldName: "maxSteerRad",
    valueRaw: `atan(${String(wheelbaseM)} / ${String(minTurnRadiusM)})`,
    unitRaw: "rad",
    valueNormalized: Math.atan(wheelbaseM / minTurnRadiusM),
    sourceUrl: source.sourceUrl,
    sourceTitle: source.sourceTitle,
    sourceType: "DERIVED",
    confidence: Math.min(source.confidence, 0.9),
    formula: "atan(wheelbaseM / minTurnRadiusM)",
    formulaInputs: { wheelbaseM, minTurnRadiusM },
    retrievedAt: source.retrievedAt,
  };
}

function hasConflictingEvidence(evidence: readonly VehicleSpecEvidence[]): boolean {
  const byField = new Map<string, number[]>();
  for (const item of evidence) {
    if (item.sourceType === "ESTIMATED" || item.valueNormalized === undefined) continue;
    const values = byField.get(item.fieldName) ?? [];
    values.push(item.valueNormalized);
    byField.set(item.fieldName, values);
  }
  for (const [field, values] of byField) {
    if (values.length < 2) continue;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const tolerance = field === "maxSteerRad" || field === "minTurnRadiusM" ? 0.1 : 0.03;
    if (minimum <= 0 || (maximum - minimum) / minimum > tolerance) return true;
  }
  return false;
}

export function buildResolvedVehicleProfile(
  candidate: VehicleCandidate,
  resolved: BraveResolvedVehicle,
  now = new Date(),
): ResolvedVehicleProfile {
  const normalizedEvidence = resolved.evidence.map(normalizeEvidence);
  let byField = evidenceByField(normalizedEvidence);
  const wheelbase = byField.wheelbaseM?.valueNormalized;
  const radius = byField.minTurnRadiusM?.valueNormalized;
  if (byField.maxSteerRad === undefined && wheelbase !== undefined && radius !== undefined) {
    const radiusSource = byField.minTurnRadiusM;
    if (!radiusSource)
      throw new Error("Turning-radius provenance is required for steering derivation.");
    normalizedEvidence.push(deriveSteeringEvidence(wheelbase, radius, radiusSource));
    byField = evidenceByField(normalizedEvidence);
  }

  const requiredFields = [
    "lengthM",
    "widthM",
    "wheelbaseM",
    "frontOverhangM",
    "rearOverhangM",
    "maxSteerRad",
  ] as const;
  const missingFields = requiredFields.filter(
    (field) => byField[field]?.valueNormalized === undefined,
  );
  const canonicalKey =
    candidate.canonicalKey ??
    canonicalizeVehicleCandidate({
      ...candidate,
      manufacturer: resolved.manufacturer,
      model: resolved.model,
      generation: resolved.generation,
      trim: resolved.trim,
      market: resolved.market,
      modelYear: resolved.modelYear,
    });

  const value = (field: (typeof requiredFields)[number]): number =>
    byField[field]?.valueNormalized ?? 0;
  const profile: VehicleProfile = {
    id: candidate.profileId ?? `catalog:${canonicalKey}`,
    name: resolved.displayName,
    category: resolved.category,
    manufacturer: resolved.manufacturer,
    model: resolved.model,
    canonicalKey,
    lengthM: value("lengthM"),
    widthM: value("widthM"),
    wheelbaseM: value("wheelbaseM"),
    frontOverhangM: value("frontOverhangM"),
    rearOverhangM: value("rearOverhangM"),
    maxSteerRad: value("maxSteerRad"),
    ...(resolved.generation ? { generation: resolved.generation } : {}),
    ...(resolved.trim ? { trim: resolved.trim } : {}),
    ...(resolved.market ? { market: resolved.market } : {}),
    ...(byField.minTurnRadiusM?.valueNormalized !== undefined
      ? { minTurnRadiusM: byField.minTurnRadiusM.valueNormalized }
      : {}),
    ...(byField.trackWidthM?.valueNormalized !== undefined
      ? { trackWidthM: byField.trackWidthM.valueNormalized }
      : {}),
    dataStatus: "REVIEW_REQUIRED",
  };
  const validationIssues = missingFields.length === 0 ? validateVehicleProfile(profile) : [];
  const dataStatus =
    missingFields.length === 0 &&
    validationIssues.length === 0 &&
    !hasConflictingEvidence(normalizedEvidence)
      ? "READY"
      : "REVIEW_REQUIRED";
  return {
    profile: { ...profile, dataStatus },
    aliases: [
      ...new Set(
        [resolved.displayName, ...resolved.aliases].map((alias) => alias.trim()).filter(Boolean),
      ),
    ],
    evidence: normalizedEvidence.map(normalizeEvidence),
    dataVersion: 1,
    lastVerifiedAt: now,
  };
}

export function searchTextForProfile(profile: VehicleProfile, aliases: readonly string[]): string {
  return normalizeVehicleText(
    [
      profile.manufacturer,
      profile.model,
      profile.generation,
      profile.trim,
      profile.market,
      profile.name,
      ...aliases,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
