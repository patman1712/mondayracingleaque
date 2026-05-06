import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAdminCookie, verifyAdminSession } from "@/lib/adminAuth";

export const runtime = "nodejs";

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

function deleteUpload(fileName: string | null | undefined) {
  if (!fileName) return;
  const abs = path.join(dataRootDir(), "uploads", fileName);
  try {
    fs.unlinkSync(abs);
  } catch {}
}

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

async function isAdmin() {
  const token = await readAdminCookie();
  if (!token) return false;
  const session = await verifyAdminSession(token);
  return Boolean(session);
}

export async function POST(req: Request) {
  const ok = await isAdmin();
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const raceId = String(fd.get("raceId") ?? "").trim();
  const file = fd.get("file");

  if (!raceId || !(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  if (file.size > 8_000_000) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
  }

  const ext = extFromMime(file.type);
  if (!ext) return NextResponse.json({ ok: false, error: "unsupported_type" }, { status: 415 });

  const race = await prisma.race
    .findUnique({ where: { id: raceId }, select: { id: true, resultsImagePath: true } })
    .catch(() => null);
  if (!race) return NextResponse.json({ ok: false, error: "race_not_found" }, { status: 404 });

  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);

  const fileName = `poster-${raceId}-${Date.now()}.${ext}`;
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);

  await prisma.race
    .update({
      where: { id: raceId },
      data: { resultsImagePath: fileName }
    })
    .catch(() => null);

  deleteUpload(race.resultsImagePath);

  return NextResponse.json({ ok: true, url: `/api/uploads/${encodeURIComponent(fileName)}` });
}

