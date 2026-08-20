import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

export function createDbClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is required for database access.");
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: 10,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as typeof globalThis & { nrsPrisma?: PrismaClient };

export function getDbClient(): PrismaClient {
  const client = globalForPrisma.nrsPrisma ?? createDbClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.nrsPrisma = client;
  return client;
}
