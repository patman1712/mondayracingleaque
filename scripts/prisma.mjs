import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function resolveDatabaseUrl() {
  const existing = process.env.DATABASE_URL;
  if (existing && existing.startsWith("file:")) return existing;

  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return "file:/app/data/mrl.db";

  return "file:./data/mrl.db";
}

function prismaBin() {
  return path.join(process.cwd(), "node_modules", ".bin", "prisma");
}

process.env.DATABASE_URL = resolveDatabaseUrl();

ensureDir(path.join(process.cwd(), "data"));

const prisma = prismaBin();
const cmd = process.argv[2] ?? "generate";

const args =
  cmd === "push" ? ["db", "push", "--accept-data-loss"] : ["generate"];
const res = spawnSync(prisma, args, {
  stdio: "inherit",
  env: process.env
});

process.exit(res.status ?? 1);
