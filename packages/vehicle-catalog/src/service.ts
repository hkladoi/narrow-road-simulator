import type {
  BraveVehicleClient,
  ResolvedVehicleProfile,
  VehicleCandidate,
  VehicleCatalogRepository,
  VehicleSearchResponse,
} from "./contracts";
import {
  canonicalizeVehicleCandidate,
  dedupeCandidates,
  normalizeVehicleText,
} from "./normalization";
import { buildResolvedVehicleProfile } from "./resolution";

export type VehicleCatalogServiceOptions = Readonly<{
  searchCacheTtlMs: number;
  braveTimeoutMs: number;
  sufficientLocalResults: number;
  now?: () => Date;
}>;

export class VehicleCatalogError extends Error {
  public constructor(
    public readonly code:
      "INVALID_QUERY" | "BRAVE_TIMEOUT" | "BRAVE_UNAVAILABLE" | "PROFILE_REVIEW_REQUIRED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VehicleCatalogError";
  }
}

function exactReadyMatch(results: readonly VehicleCandidate[], normalizedQuery: string): boolean {
  return results.some(
    (candidate) =>
      candidate.dataStatus === "READY" &&
      [candidate.displayName, candidate.canonicalKey, candidate.model]
        .filter((value): value is string => Boolean(value))
        .some((value) => normalizeVehicleText(value) === normalizedQuery),
  );
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new VehicleCatalogError("BRAVE_TIMEOUT", "Dịch vụ tìm kiếm xe đã hết thời gian chờ.", {
        cause: error,
      });
    }
    throw new VehicleCatalogError("BRAVE_UNAVAILABLE", "Dịch vụ tìm kiếm xe hiện không khả dụng.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class VehicleCatalogService {
  public constructor(
    private readonly repository: VehicleCatalogRepository,
    private readonly brave: BraveVehicleClient,
    private readonly options: VehicleCatalogServiceOptions,
  ) {}

  public async search(query: string): Promise<VehicleSearchResponse> {
    const normalizedQuery = normalizeVehicleText(query);
    if (!normalizedQuery) {
      throw new VehicleCatalogError("INVALID_QUERY", "Vui lòng nhập tên hoặc từ khóa xe.");
    }
    const now = this.options.now?.() ?? new Date();
    const local = await this.repository.searchLocal(normalizedQuery);
    if (
      exactReadyMatch(local, normalizedQuery) ||
      local.length >= this.options.sufficientLocalResults
    ) {
      return { query, normalizedQuery, braveUsed: false, results: dedupeCandidates(local) };
    }
    const cached = await this.repository.getSearchCache(normalizedQuery, now);
    if (cached) {
      return {
        query,
        normalizedQuery,
        braveUsed: false,
        results: dedupeCandidates([...local, ...cached.results]),
      };
    }
    const web = await withTimeout(this.options.braveTimeoutMs, (signal) =>
      this.brave.searchCandidates(query, signal),
    );
    const results = dedupeCandidates([...local, ...web]);
    await this.repository.putSearchCache({
      normalizedQuery,
      results,
      expiresAt: new Date(now.getTime() + this.options.searchCacheTtlMs),
    });
    return { query, normalizedQuery, braveUsed: true, results };
  }

  public async resolve(candidate: VehicleCandidate): Promise<ResolvedVehicleProfile> {
    const canonicalKey = candidate.canonicalKey ?? canonicalizeVehicleCandidate(candidate);
    const existing = await this.repository.getProfileByCanonicalKey(canonicalKey);
    if (existing?.profile.dataStatus === "READY") return existing;

    return this.repository.withResolveLock(canonicalKey, async (lockedRepository) => {
      const insideLock = await lockedRepository.getProfileByCanonicalKey(canonicalKey);
      if (insideLock?.profile.dataStatus === "READY") return insideLock;
      const resolved = await withTimeout(this.options.braveTimeoutMs, (signal) =>
        this.brave.resolveSpecs({ ...candidate, canonicalKey }, signal),
      );
      const profile = buildResolvedVehicleProfile({ ...candidate, canonicalKey }, resolved);
      return lockedRepository.upsertResolvedProfile(profile);
    });
  }
}
