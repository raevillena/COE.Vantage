import { PrismaClient } from "@prisma/client";
import { installCollegeScope } from "../utils/collegeScope.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
  installCollegeScope(client);
  // Logs queries that take long, so a slow page can be traced to the model and action behind it (outermost middleware: includes the scope work).
  const slowMs = Number(process.env.SLOW_QUERY_MS ?? 500);
  if (slowMs > 0) {
    client.$use(async (params, next) => {
      const started = Date.now();
      try {
        return await next(params);
      } finally {
        const took = Date.now() - started;
        if (took >= slowMs) console.warn(`[slow-query] ${params.model ?? "raw"}.${params.action} took ${took} ms`);
      }
    });
  }
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
