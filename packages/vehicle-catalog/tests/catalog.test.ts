import type {
  BraveResolvedVehicle,
  BraveVehicleClient,
  ResolvedVehicleProfile,
  SearchCacheEntry,
  VehicleCandidate,
  VehicleCatalogRepository,
  VehicleSpecField,
} from "../src";
import { describe, expect, it, vi } from "vitest";

import {
  buildResolvedVehicleProfile,
  canonicalizeVehicleCandidate,
  normalizeVehicleText,
  parseLengthToMeters,
  VehicleCatalogService,
} from "../src";

class MemoryRepository implements VehicleCatalogRepository {
  public local: VehicleCandidate[] = [];
  public cache = new Map<string, SearchCacheEntry>();
  public profiles = new Map<string, ResolvedVehicleProfile>();
  private readonly locks = new Map<string, Promise<void>>();

  public searchLocal(normalizedQuery: string) {
    return Promise.resolve(
      this.local.filter((candidate) =>
        normalizeVehicleText(candidate.displayName).includes(normalizedQuery),
      ),
    );
  }

  public getSearchCache(normalizedQuery: string, now: Date) {
    const entry = this.cache.get(normalizedQuery);
    return Promise.resolve(entry && entry.expiresAt > now ? entry : undefined);
  }

  public putSearchCache(entry: SearchCacheEntry) {
    this.cache.set(entry.normalizedQuery, entry);
    return Promise.resolve();
  }

  public getProfileByCanonicalKey(canonicalKey: string) {
    return Promise.resolve(this.profiles.get(canonicalKey));
  }

  public async withResolveLock<T>(
    canonicalKey: string,
    task: (lockedRepository: VehicleCatalogRepository) => Promise<T>,
  ): Promise<T> {
    while (this.locks.has(canonicalKey)) await this.locks.get(canonicalKey);
    let release: (() => void) | undefined;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(canonicalKey, lock);
    try {
      return await task(this);
    } finally {
      this.locks.delete(canonicalKey);
      release?.();
    }
  }

  public upsertResolvedProfile(profile: ResolvedVehicleProfile) {
    const key = profile.profile.canonicalKey;
    if (!key) return Promise.reject(new Error("Canonical key required."));
    this.profiles.set(key, profile);
    return Promise.resolve(profile);
  }
}

const vf5: VehicleCandidate = {
  displayName: "VinFast VF 5",
  manufacturer: "VinFast",
  model: "VF 5",
  dataStatus: "READY",
  source: "DATABASE",
  canonicalKey: "vinfast:vf5",
};

const resolvedVehicle = (): BraveResolvedVehicle => ({
  manufacturer: "VinFast",
  model: "VF 5",
  displayName: "VinFast VF 5",
  category: "suv",
  aliases: ["VF5", "VF 5"],
  evidence: (
    [
      ["lengthM", "3967", "mm"],
      ["widthM", "1723", "mm"],
      ["wheelbaseM", "2514", "mm"],
      ["frontOverhangM", "730", "mm"],
      ["rearOverhangM", "723", "mm"],
      ["minTurnRadiusM", "4.7", "m"],
    ] satisfies readonly (readonly [VehicleSpecField, string, string])[]
  ).map(([fieldName, valueRaw, unitRaw]) => ({
    fieldName,
    valueRaw,
    unitRaw,
    sourceUrl: "https://example.test/spec",
    sourceTitle: "Manufacturer specification",
    sourceType: "DIRECT" as const,
    confidence: 0.95,
    retrievedAt: new Date("2026-08-20T00:00:00Z"),
  })),
});

function setup() {
  const repository = new MemoryRepository();
  const webCandidate: VehicleCandidate = {
    ...vf5,
    source: "WEB",
    dataStatus: "CANDIDATE_ONLY",
  };
  const brave: BraveVehicleClient = {
    searchCandidates: vi.fn(() => Promise.resolve([webCandidate])),
    resolveSpecs: vi.fn(() => Promise.resolve(resolvedVehicle())),
  };
  const service = new VehicleCatalogService(repository, brave, {
    searchCacheTtlMs: 60_000,
    braveTimeoutMs: 1_000,
    sufficientLocalResults: 5,
    now: () => new Date("2026-08-20T00:00:00Z"),
  });
  return { repository, brave, service };
}

describe("vehicle query normalization", () => {
  it.each(["VF5", "VF 5", "vf-5"])("canonicalizes %s consistently", (query) => {
    expect(normalizeVehicleText(query)).toBe("vf5");
  });

  it("keeps distinct variants in the canonical identity", () => {
    expect(canonicalizeVehicleCandidate(vf5)).toBe("vinfast:vf5");
    expect(canonicalizeVehicleCandidate({ ...vf5, trim: "Plus" })).toBe("vinfast:vf5:plus");
  });

  it.each([
    ["4650 mm", 4.65],
    ["465 cm", 4.65],
    ["183.07 in", 4.65],
  ])("converts %s to metres", (raw, expected) => {
    expect(parseLengthToMeters(raw)).toBeCloseTo(expected, 4);
  });
});

describe("DB-first search and shared resolve", () => {
  it("does not call Brave on an exact READY DB hit", async () => {
    const { repository, brave, service } = setup();
    repository.local.push(vf5);
    const result = await service.search("VF 5");
    expect(result.braveUsed).toBe(false);
    expect(brave.searchCandidates).not.toHaveBeenCalled();
  });

  it("does not call Brave on a fresh search-cache hit", async () => {
    const { repository, brave, service } = setup();
    repository.cache.set("vf5", {
      normalizedQuery: "vf5",
      results: [vf5],
      expiresAt: new Date("2026-08-20T01:00:00Z"),
    });
    expect((await service.search("VF5")).braveUsed).toBe(false);
    expect(brave.searchCandidates).not.toHaveBeenCalled();
  });

  it("calls Brave exactly once on DB/cache miss", async () => {
    const { brave, service } = setup();
    expect((await service.search("VF5")).braveUsed).toBe(true);
    expect(brave.searchCandidates).toHaveBeenCalledTimes(1);
  });

  it("derives steering with complete provenance", () => {
    const resolved = buildResolvedVehicleProfile(vf5, resolvedVehicle());
    const steering = resolved.evidence.find((item) => item.fieldName === "maxSteerRad");
    expect(steering).toMatchObject({
      sourceType: "DERIVED",
      formula: "atan(wheelbaseM / minTurnRadiusM)",
    });
    expect(steering?.formulaInputs?.wheelbaseM).toBeCloseTo(2.514, 12);
    expect(steering?.formulaInputs?.minTurnRadiusM).toBeCloseTo(4.7, 12);
    expect(resolved.profile.dataStatus).toBe("READY");
  });

  it("does not mark a profile READY when a critical field is missing", () => {
    const incomplete = resolvedVehicle();
    const result = buildResolvedVehicleProfile(vf5, {
      ...incomplete,
      evidence: incomplete.evidence.filter((item) => item.fieldName !== "wheelbaseM"),
    });
    expect(result.profile.dataStatus).toBe("REVIEW_REQUIRED");
  });

  it("single-flights concurrent resolve for the same canonical key", async () => {
    const { brave, service } = setup();
    const [first, second] = await Promise.all([service.resolve(vf5), service.resolve(vf5)]);
    expect(first.profile.canonicalKey).toBe(second.profile.canonicalKey);
    expect(brave.resolveSpecs).toHaveBeenCalledTimes(1);
  });
});
