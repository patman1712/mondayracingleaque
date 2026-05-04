import fs from "node:fs";
import path from "node:path";

function parseSqliteFile(url: string | undefined) {
  if (!url) return null;
  if (!url.startsWith("file:")) return null;
  const p = url.slice("file:".length);
  return p;
}

function isWritableDir(p: string) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const dbFile = parseSqliteFile(dbUrl);

  const resolvedDbPath =
    dbFile && dbFile.startsWith("/")
      ? dbFile
      : dbFile
        ? path.join(process.cwd(), dbFile)
        : null;

  const dbExists = resolvedDbPath ? fs.existsSync(resolvedDbPath) : false;
  const dbDir = resolvedDbPath ? path.dirname(resolvedDbPath) : null;

  const mount = "/app/data";
  const mounted = fs.existsSync(mount);
  const mountWritable = mounted ? isWritableDir(mount) : false;

  const dirExists = dbDir ? fs.existsSync(dbDir) : false;
  const dirWritable = dbDir ? isWritableDir(dbDir) : false;

  let canWriteTestFile = false;
  try {
    if (dbDir) {
      const testPath = path.join(dbDir, `.rwtest-${Date.now()}`);
      fs.writeFileSync(testPath, "ok");
      fs.unlinkSync(testPath);
      canWriteTestFile = true;
    }
  } catch {}

  const stat = dbExists && resolvedDbPath ? fs.statSync(resolvedDbPath) : null;

  return Response.json(
    {
      databaseUrl: dbUrl ?? null,
      resolvedDbPath,
      dbExists,
      dbSizeBytes: stat ? stat.size : null,
      dbMtimeMs: stat ? stat.mtimeMs : null,
      dbDir,
      dirExists,
      dirWritable,
      canWriteTestFile,
      mount,
      mounted,
      mountWritable,
      cwd: process.cwd()
    },
    { headers: { "cache-control": "no-store" } }
  );
}
