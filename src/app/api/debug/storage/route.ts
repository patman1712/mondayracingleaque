import fs from "node:fs";
import path from "node:path";

function parseSqliteFile(url: string | undefined) {
  if (!url) return null;
  if (!url.startsWith("file:")) return null;
  const p = url.slice("file:".length);
  return p;
}

export async function GET() {
  const mount = "/app/data";
  const mounted = fs.existsSync(mount);

  const dbUrl = process.env.DATABASE_URL;
  const dbFile = parseSqliteFile(dbUrl);

  const resolvedDbPath =
    dbFile && dbFile.startsWith("/")
      ? dbFile
      : dbFile
        ? path.join(process.cwd(), dbFile)
        : null;

  const dbExists = resolvedDbPath ? fs.existsSync(resolvedDbPath) : false;

  let writable = false;
  try {
    const testPath = path.join(mount, ".rwtest");
    fs.writeFileSync(testPath, "ok");
    fs.unlinkSync(testPath);
    writable = true;
  } catch {}

  return Response.json(
    {
      mounted,
      writable,
      databaseUrl: dbUrl ?? null,
      resolvedDbPath,
      dbExists,
      cwd: process.cwd()
    },
    { headers: { "cache-control": "no-store" } }
  );
}

