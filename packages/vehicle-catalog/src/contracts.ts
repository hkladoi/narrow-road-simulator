import type { VehicleCategory, VehicleProfile } from "@nrs/domain";
import { z } from "zod";

export const vehicleCandidateSchema = z.object({
  canonicalKey: z.string().min(1).optional(),
  displayName: z.string().min(1),
  manufacturer: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  generation: z.string().min(1).optional(),
  trim: z.string().min(1).optional(),
  modelYear: z.number().int().min(1886).max(2200).optional(),
  market: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  dataStatus: z.enum(["READY", "PARTIAL", "RESOLVING", "REVIEW_REQUIRED", "CANDIDATE_ONLY"]),
  source: z.enum(["DATABASE", "WEB"]),
});

export type VehicleCandidate = z.infer<typeof vehicleCandidateSchema>;

export const vehicleSearchRequestSchema = z.object({ query: z.string().trim().min(1).max(120) });

export type VehicleSearchResponse = Readonly<{
  query: string;
  normalizedQuery: string;
  braveUsed: boolean;
  results: readonly VehicleCandidate[];
}>;

export type EvidenceSourceType = "DIRECT" | "DERIVED" | "ESTIMATED";

export type VehicleSpecField =
  | "lengthM"
  | "widthM"
  | "wheelbaseM"
  | "frontOverhangM"
  | "rearOverhangM"
  | "maxSteerRad"
  | "minTurnRadiusM"
  | "trackWidthM";

export type VehicleSpecEvidence = Readonly<{
  fieldName: VehicleSpecField;
  valueRaw: string;
  unitRaw?: string;
  valueNormalized?: number;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: EvidenceSourceType;
  confidence: number;
  formula?: string;
  formulaInputs?: Readonly<Record<string, number>>;
  retrievedAt: Date;
}>;

export type BraveResolvedVehicle = Readonly<{
  manufacturer: string;
  model: string;
  displayName: string;
  category: VehicleCategory;
  generation?: string;
  trim?: string;
  market?: string;
  modelYear?: number;
  aliases: readonly string[];
  evidence: readonly VehicleSpecEvidence[];
}>;

export type ResolvedVehicleProfile = Readonly<{
  profile: VehicleProfile;
  aliases: readonly string[];
  evidence: readonly VehicleSpecEvidence[];
  dataVersion: number;
  lastVerifiedAt: Date;
}>;

export type SearchCacheEntry = Readonly<{
  normalizedQuery: string;
  results: readonly VehicleCandidate[];
  expiresAt: Date;
}>;

export type VehicleCatalogRepository = Readonly<{
  searchLocal(normalizedQuery: string): Promise<readonly VehicleCandidate[]>;
  getSearchCache(normalizedQuery: string, now: Date): Promise<SearchCacheEntry | undefined>;
  putSearchCache(entry: SearchCacheEntry): Promise<void>;
  getProfileByCanonicalKey(canonicalKey: string): Promise<ResolvedVehicleProfile | undefined>;
  withResolveLock<T>(
    canonicalKey: string,
    task: (lockedRepository: VehicleCatalogRepository) => Promise<T>,
  ): Promise<T>;
  upsertResolvedProfile(profile: ResolvedVehicleProfile): Promise<ResolvedVehicleProfile>;
}>;

export type BraveVehicleClient = Readonly<{
  searchCandidates(query: string, signal: AbortSignal): Promise<readonly VehicleCandidate[]>;
  resolveSpecs(candidate: VehicleCandidate, signal: AbortSignal): Promise<BraveResolvedVehicle>;
}>;
