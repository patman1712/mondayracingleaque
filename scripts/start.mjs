import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return "file:/app/data/mrl.db";

  return "file:./data/mrl.db";
}

function prismaBin() {
  const p = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  return p;
}

function nextBin() {
  const p = path.join(process.cwd(), "node_modules", ".bin", "next");
  return p;
}

const dbUrl = resolveDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

if (dbUrl.startsWith("file:/app/data/")) ensureDir("/app/data");
ensureDir(path.join(process.cwd(), "data"));

const prisma = prismaBin();
const next = nextBin();

const cmd = process.argv[2] ?? "start";

const push = spawnSync(prisma, ["db", "push"], {
  stdio: "inherit",
  env: process.env
});

if (push.status !== 0) process.exit(push.status ?? 1);

const args =
  cmd === "dev" ? ["dev"] : cmd === "build" ? ["build"] : ["start"];

const child = spawn(next, args, {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => process.exit(code ?? 0));
