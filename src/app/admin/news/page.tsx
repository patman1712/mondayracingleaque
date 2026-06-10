import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";
import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
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

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

function asUploadFile(v: unknown): File | null {
  if (!v || typeof v !== "object") return null;
  const f = v as { arrayBuffer?: unknown; size?: unknown; type?: unknown };
  if (typeof f.arrayBuffer !== "function") return null;
  if (typeof f.size !== "number") return null;
  if (typeof f.type !== "string") return null;
  return v as File;
}

async function writeUpload(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

function deleteUpload(fileName: string | null | undefined) {
  if (!fileName) return;
  const abs = path.join(dataRootDir(), "uploads", fileName);
  try {
    fs.unlinkSync(abs);
  } catch {}
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

async function createNews(formData: FormData) {
  "use server";
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const publish = formData.get("publish") === "on";
  const image = asUploadFile(formData.get("image"));

  if (!title || !content) return;

  const baseSlug = slugify(title);
  let slug = baseSlug || "news";

  const existing = await prisma.newsPost.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const created = await prisma.newsPost.create({
    data: {
      title,
      slug,
      excerpt: excerpt || null,
      content,
      imagePath: null,
      publishedAt: publish ? new Date() : null
    },
    select: { id: true }
  });

  if (image && image.size > 0) {
    if (image.size > 8_000_000) return;
    const ext = extFromMime(image.type);
    if (!ext) return;
    const fileName = `news-image-${created.id}-${Date.now()}.${ext}`;
    await writeUpload(fileName, image);
    await prisma.newsPost
      .update({ where: { id: created.id }, data: { imagePath: fileName } })
      .catch(() => null);
  }

  revalidatePath("/news");
  revalidatePath("/");
  revalidatePath("/admin/news");
}

async function deleteNews(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const current = await prisma.newsPost
    .findUnique({ where: { id }, select: { imagePath: true } })
    .catch(() => null);
  deleteUpload(current?.imagePath ?? null);
  await prisma.newsPost.delete({ where: { id } }).catch(() => null);
  revalidatePath("/news");
  revalidatePath("/");
  revalidatePath("/admin/news");
}

export default async function AdminNewsPage() {
  await requireAdmin();

  type PostItem = {
    id: string;
    title: string;
    slug: string;
    publishedAt: Date | null;
    imagePath: string | null;
  };

  let posts: PostItem[] = [];
  try {
    posts = await prisma.newsPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, slug: true, publishedAt: true, imagePath: true }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">News anlegen</div>
          <form
            action={createNews}
            encType="multipart/form-data"
            className="mt-4 grid gap-4"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Titel
              </label>
              <input
                name="title"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Kurztext
              </label>
              <input
                name="excerpt"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Inhalt
              </label>
              <textarea
                name="content"
                rows={8}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Bild (optional)
              </label>
              <input
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="publish" className="h-4 w-4" /> Sofort
              veröffentlichen
            </label>
            <button className="w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
              Speichern
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Letzte News</div>
          <div className="mt-4 space-y-3">
            {posts.length === 0 ? (
              <div className="text-sm text-white/60">Noch keine News.</div>
            ) : (
              posts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {p.imagePath ? (
                      <img
                        src={imageUrl(p.imagePath) ?? ""}
                        alt=""
                        className="h-10 w-16 shrink-0 rounded-lg bg-black/20 object-cover"
                      />
                    ) : (
                      <div className="h-10 w-16 shrink-0 rounded-lg bg-black/20" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{p.title}</div>
                    <div className="mt-1 text-sm text-white/60">
                      {p.publishedAt ? "Veröffentlicht" : "Entwurf"} · /news/
                      {p.slug}
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/news/${p.slug}`}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Öffnen
                    </Link>
                    <Link
                      href={`/admin/news/${p.id}`}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Bearbeiten
                    </Link>
                    <form action={deleteNews}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                        Löschen
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
