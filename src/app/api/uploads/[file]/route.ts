import fs from "node:fs";
import path from "node:path";

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

export async function GET(
  _req: Request,
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
  const buf = fs.readFileSync(abs);
  return new Response(buf, {
    headers: {
      "content-type": contentTypeFromExt(ext),
      "cache-control": "public, max-age=604800"
    }
  });
}
