import type { VehicleCategory, VehicleProfile } from "@nrs/domain";
import {
  normalizeVehicleText,
  searchTextForProfile,
  vehicleCandidateSchema,
  type ResolvedVehicleProfile,
  type SearchCacheEntry,
  type VehicleCandidate,
  type VehicleCatalogRepository,
} from "@nrs/vehicle-catalog";

import {
  EvidenceSourceType,
  Prisma,
  type PrismaClient,
  VehicleCategory as DbVehicleCategory,
  VehicleDataStatus,
} from "./generated/prisma/client";

type CatalogExecutor = PrismaClient | Prisma.TransactionClient;
type ProfileWithEvidence = Prisma.VehicleProfileGetPayload<{
  include: { aliases: true; sources: true };
}>;

function toDbCategory(category: VehicleCategory): DbVehicleCategory {
  return DbVehicleCategory[category.toUpperCase() as keyof typeof DbVehicleCategory];
}

function toDomainCategory(category: DbVehicleCategory): VehicleCategory {
  return category.toLowerCase() as VehicleCategory;
}

function requiredNumber(value: number | null): number {
  return value ?? 0;
}

function toResolvedProfile(record: ProfileWithEvidence): ResolvedVehicleProfile {
  const profile: VehicleProfile = {
    id: record.id,
    name: record.displayName,
    category: toDomainCategory(record.category),
    lengthM: requiredNumber(record.lengthM),
    widthM: requiredNumber(record.widthM),
    wheelbaseM: requiredNumber(record.wheelbaseM),
    frontOverhangM: requiredNumber(record.frontOverhangM),
    rearOverhangM: requiredNumber(record.rearOverhangM),
    maxSteerRad: requiredNumber(record.maxSteerRad),
    manufacturer: record.manufacturer,
    model: record.model,
    canonicalKey: record.canonicalKey,
    dataStatus: record.status,
    ...(record.generation ? { generation: record.generation } : {}),
    ...(record.trim ? { trim: record.trim } : {}),
    ...(record.market ? { market: record.market } : {}),
    ...(record.minTurnRadiusM !== null ? { minTurnRadiusM: record.minTurnRadiusM } : {}),
    ...(record.trackWidthM !== null ? { trackWidthM: record.trackWidthM } : {}),
  };
  return {
    profile,
    aliases: record.aliases.map((alias) => alias.alias),
    evidence: record.sources.map((source) => ({
      fieldName: source.fieldName as never,
      valueRaw: source.valueRaw,
      sourceUrl: source.sourceUrl,
      sourceTitle: source.sourceTitle,
      sourceType: source.sourceType,
      confidence: source.confidence,
      retrievedAt: source.retrievedAt,
      ...(source.unitRaw ? { unitRaw: source.unitRaw } : {}),
      ...(source.valueNormalized !== null ? { valueNormalized: source.valueNormalized } : {}),
      ...(source.formula ? { formula: source.formula } : {}),
      ...(source.formulaInputs && typeof source.formulaInputs === "object"
        ? { formulaInputs: source.formulaInputs as Record<string, number> }
        : {}),
    })),
    dataVersion: record.dataVersion,
    lastVerifiedAt: record.lastVerifiedAt ?? record.updatedAt,
  };
}

function toCandidate(record: ProfileWithEvidence): VehicleCandidate {
  return {
    canonicalKey: record.canonicalKey,
    displayName: record.displayName,
    manufacturer: record.manufacturer,
    model: record.model,
    profileId: record.id,
    dataStatus: record.status,
    source: "DATABASE",
    ...(record.generation ? { generation: record.generation } : {}),
    ...(record.trim ? { trim: record.trim } : {}),
    ...(record.modelYear !== null ? { modelYear: record.modelYear } : {}),
    ...(record.market ? { market: record.market } : {}),
  };
}

export class PrismaVehicleCatalogRepository implements VehicleCatalogRepository {
  public constructor(
    private readonly rootClient: PrismaClient,
    private readonly executor: CatalogExecutor = rootClient,
  ) {}

  public async searchLocal(normalizedQuery: string): Promise<readonly VehicleCandidate[]> {
    const records = await this.executor.vehicleProfile.findMany({
      where: {
        OR: [
          { canonicalKey: { contains: normalizedQuery, mode: "insensitive" } },
          { searchTextNormalized: { contains: normalizedQuery, mode: "insensitive" } },
          {
            aliases: {
              some: { aliasNormalized: { contains: normalizedQuery, mode: "insensitive" } },
            },
          },
        ],
      },
      include: { aliases: true, sources: true },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      take: 20,
    });
    return records.map(toCandidate);
  }

  public async getSearchCache(
    normalizedQuery: string,
    now: Date,
  ): Promise<SearchCacheEntry | undefined> {
    const cache = await this.executor.vehicleSearchCache.findUnique({
      where: { queryNormalized: normalizedQuery },
    });
    if (!cache || cache.expiresAt <= now) return undefined;
    const parsed = vehicleCandidateSchema.array().safeParse(cache.resultJson);
    if (!parsed.success) return undefined;
    return { normalizedQuery, results: parsed.data, expiresAt: cache.expiresAt };
  }

  public async putSearchCache(entry: SearchCacheEntry): Promise<void> {
    await this.executor.vehicleSearchCache.upsert({
      where: { queryNormalized: entry.normalizedQuery },
      create: {
        queryNormalized: entry.normalizedQuery,
        resultJson: entry.results,
        expiresAt: entry.expiresAt,
      },
      update: {
        resultJson: entry.results,
        expiresAt: entry.expiresAt,
      },
    });
  }

  public async getProfileByCanonicalKey(
    canonicalKey: string,
  ): Promise<ResolvedVehicleProfile | undefined> {
    const record = await this.executor.vehicleProfile.findUnique({
      where: { canonicalKey },
      include: { aliases: true, sources: true },
    });
    return record ? toResolvedProfile(record) : undefined;
  }

  public async withResolveLock<T>(
    canonicalKey: string,
    task: (lockedRepository: VehicleCatalogRepository) => Promise<T>,
  ): Promise<T> {
    return this.rootClient.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${canonicalKey}))`;
        return task(new PrismaVehicleCatalogRepository(this.rootClient, transaction));
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  public async upsertResolvedProfile(
    resolved: ResolvedVehicleProfile,
  ): Promise<ResolvedVehicleProfile> {
    const canonicalKey = resolved.profile.canonicalKey;
    const manufacturer = resolved.profile.manufacturer;
    const model = resolved.profile.model;
    if (!canonicalKey || !manufacturer || !model) {
      throw new Error("Persisted catalog profiles require canonicalKey, manufacturer, and model.");
    }
    const aliases = resolved.aliases.map((alias) => ({
      alias,
      aliasNormalized: normalizeVehicleText(alias),
    }));
    const sources = resolved.evidence.map((source) => ({
      fieldName: source.fieldName,
      valueRaw: source.valueRaw,
      valueNormalized: source.valueNormalized ?? null,
      unitRaw: source.unitRaw ?? null,
      sourceUrl: source.sourceUrl,
      sourceTitle: source.sourceTitle,
      sourceDomain: new URL(source.sourceUrl).hostname,
      sourceType: EvidenceSourceType[source.sourceType],
      confidence: source.confidence,
      formula: source.formula ?? null,
      formulaInputs: source.formulaInputs
        ? (source.formulaInputs as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      retrievedAt: source.retrievedAt,
    }));
    const scalarData = {
      canonicalKey,
      manufacturer,
      model,
      displayName: resolved.profile.name,
      searchTextNormalized: searchTextForProfile(resolved.profile, resolved.aliases),
      category: toDbCategory(resolved.profile.category),
      status: VehicleDataStatus[resolved.profile.dataStatus ?? "REVIEW_REQUIRED"],
      lengthM: resolved.profile.lengthM || null,
      widthM: resolved.profile.widthM || null,
      wheelbaseM: resolved.profile.wheelbaseM || null,
      frontOverhangM: resolved.profile.frontOverhangM || null,
      rearOverhangM: resolved.profile.rearOverhangM || null,
      maxSteerRad: resolved.profile.maxSteerRad || null,
      minTurnRadiusM: resolved.profile.minTurnRadiusM ?? null,
      trackWidthM: resolved.profile.trackWidthM ?? null,
      dataVersion: resolved.dataVersion,
      lastVerifiedAt: resolved.lastVerifiedAt,
      generation: resolved.profile.generation ?? null,
      trim: resolved.profile.trim ?? null,
      market: resolved.profile.market ?? null,
    };
    await this.executor.vehicleProfile.upsert({
      where: { canonicalKey },
      create: {
        ...scalarData,
        aliases: { createMany: { data: aliases, skipDuplicates: true } },
        sources: { createMany: { data: sources } },
      },
      update: {
        ...scalarData,
        aliases: { deleteMany: {}, createMany: { data: aliases, skipDuplicates: true } },
        sources: { deleteMany: {}, createMany: { data: sources } },
      },
    });
    const record = await this.executor.vehicleProfile.findUnique({
      where: { canonicalKey },
      include: { aliases: true, sources: true },
    });
    if (!record) throw new Error("Vehicle profile upsert did not return a persisted record.");
    return toResolvedProfile(record);
  }
}
