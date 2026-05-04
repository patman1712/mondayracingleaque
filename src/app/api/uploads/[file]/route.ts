import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

function contentTypeFromExt(ext: string) {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function cacheControlForFile(file: string) {
  if (/-\d{10,}\.[a-z0-9]+$/i.test(file)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600, must-revalidate";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) return new Response("Bad file", { status: 400 });
  if (file.includes("..")) return new Response("Bad file", { status: 400 });

  const uploadsDir = path.join(dataRootDir(), "uploads");
  const abs = path.join(uploadsDir, file);
  const rel = path.relative(uploadsDir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new Response("Bad file", { status: 400 });
  }

  if (!fs.existsSync(abs)) return new Response("Not found", { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(abs);
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const inm = req.headers.get("if-none-match");
  if (inm === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        etag,
        "cache-control": cacheControlForFile(file)
      }
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(abs));
  return new Response(stream as unknown as BodyInit, {
    headers: {
      "content-type": contentTypeFromExt(ext),
      "content-length": String(stat.size),
      etag,
      "cache-control": cacheControlForFile(file)
    }
  });
}
