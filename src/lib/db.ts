import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function isWritableDir(p: string) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  const existing = process.env.DATABASE_URL;
  if (existing && existing.startsWith("file:")) return existing;

  const explicitDir = process.env.MRL_DATA_DIR?.trim();
  if (explicitDir) {
    ensureDir(explicitDir);
    const dbPath = path.join(explicitDir, "mrl.db");
    return `file:${dbPath}`;
  }

  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount) && isWritableDir(railwayMount)) return "file:/app/data/mrl.db";

  ensureDir(path.join(process.cwd(), "data"));
  return "file:./data/mrl.db";
}

const databaseUrl = resolveDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: {
      db: { url: databaseUrl }
    }
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
