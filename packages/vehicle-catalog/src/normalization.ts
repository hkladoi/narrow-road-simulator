import type { VehicleCandidate, VehicleSpecEvidence, VehicleSpecField } from "./contracts";

const DIACRITIC_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export function normalizeVehicleText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITIC_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "")
    .trim();
}

export function canonicalizeVehicleCandidate(candidate: VehicleCandidate): string {
  const identity = [
    candidate.manufacturer,
    candidate.model ?? candidate.displayName,
    candidate.generation,
    candidate.modelYear?.toString(),
    candidate.trim,
    candidate.market,
  ]
    .filter((part): part is string => Boolean(part))
    .map(normalizeVehicleText)
    .filter(Boolean);
  if (identity.length === 0) throw new Error("Vehicle candidate has no canonical identity.");
  return identity.join(":");
}

export function dedupeCandidates(
  candidates: readonly VehicleCandidate[],
): readonly VehicleCandidate[] {
  const byKey = new Map<string, VehicleCandidate>();
  for (const candidate of candidates) {
    const key = candidate.canonicalKey ?? canonicalizeVehicleCandidate(candidate);
    const existing = byKey.get(key);
    if (!existing || (existing.source === "WEB" && candidate.source === "DATABASE")) {
      byKey.set(key, { ...candidate, canonicalKey: key });
    }
  }
  return [...byKey.values()];
}

const UNIT_TO_METERS: Readonly<Record<string, number>> = {
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  ft: 0.3048,
  feet: 0.3048,
};

export function parseLengthToMeters(raw: string, explicitUnit?: string): number {
  const normalized = raw.trim().toLowerCase().replaceAll(",", "");
  const match = /(-?\d+(?:\.\d+)?)\s*([a-z]+)?/.exec(normalized);
  if (!match?.[1]) throw new Error(`Cannot parse length: ${raw}`);
  const unit = (explicitUnit ?? match[2] ?? "m").toLowerCase();
  const multiplier = UNIT_TO_METERS[unit];
  if (multiplier === undefined) throw new Error(`Unsupported length unit: ${unit}`);
  const value = Number.parseFloat(match[1]) * multiplier;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Length must be positive: ${raw}`);
  return value;
}

export function normalizeEvidence(evidence: VehicleSpecEvidence): VehicleSpecEvidence {
  if (evidence.valueNormalized !== undefined) return evidence;
  if (evidence.fieldName === "maxSteerRad") {
    const degrees = Number.parseFloat(evidence.valueRaw.replaceAll(",", ""));
    if (!Number.isFinite(degrees) || degrees <= 0)
      throw new Error("Steering angle must be positive.");
    return { ...evidence, valueNormalized: (degrees * Math.PI) / 180 };
  }
  return { ...evidence, valueNormalized: parseLengthToMeters(evidence.valueRaw, evidence.unitRaw) };
}

export function evidenceByField(
  evidence: readonly VehicleSpecEvidence[],
): Readonly<Partial<Record<VehicleSpecField, VehicleSpecEvidence>>> {
  const result: Partial<Record<VehicleSpecField, VehicleSpecEvidence>> = {};
  for (const item of evidence.map(normalizeEvidence)) {
    const existing = result[item.fieldName];
    if (!existing || item.confidence > existing.confidence) result[item.fieldName] = item;
  }
  return result;
}
