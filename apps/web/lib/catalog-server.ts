import { getDbClient, PrismaVehicleCatalogRepository } from "@nrs/db";
import {
  BraveSearchVehicleClient,
  VehicleCatalogService,
  type BraveVehicleClient,
} from "@nrs/vehicle-catalog";

export function getVehicleCatalogService(): VehicleCatalogService {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  const brave: BraveVehicleClient = apiKey
    ? new BraveSearchVehicleClient(apiKey)
    : {
        searchCandidates: () =>
          Promise.reject(new Error("BRAVE_SEARCH_API_KEY chưa được cấu hình trên máy chủ.")),
        resolveSpecs: () =>
          Promise.reject(new Error("BRAVE_SEARCH_API_KEY chưa được cấu hình trên máy chủ.")),
      };
  return new VehicleCatalogService(new PrismaVehicleCatalogRepository(getDbClient()), brave, {
    searchCacheTtlMs: Number(process.env.VEHICLE_SEARCH_CACHE_TTL_MS ?? 86_400_000),
    braveTimeoutMs: Number(process.env.BRAVE_SEARCH_TIMEOUT_MS ?? 8_000),
    sufficientLocalResults: 8,
  });
}
