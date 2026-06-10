import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { slugify } from "@/lib/slugify";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
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

async function updateNews(formData: FormData) {
  "use server";
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/news?error=invalid");

  const current = await prisma.newsPost
    .findUnique({
      where: { id },
      select: { id: true, slug: true, publishedAt: true, imagePath: true }
    })
    .catch(() => null);
  if (!current) redirect("/admin/news?error=not_found");

  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const publish = formData.get("publish") === "on";
  const removeImage = formData.get("removeImage") === "on";
  const image = asUploadFile(formData.get("image"));

  if (!title || !content) redirect(`/admin/news/${id}?error=missing`);

  const baseSlug = slugify(slugInput || title);
  const slug = baseSlug || "news";

  const existing = await prisma.newsPost.findUnique({ where: { slug }, select: { id: true } });
  if (existing && existing.id !== id) redirect(`/admin/news/${id}?error=slug_taken`);

  const nextPublishedAt = publish ? current.publishedAt ?? new Date() : null;

  let nextImagePath = current.imagePath ?? null;
  if (removeImage) nextImagePath = null;

  if (image && image.size > 0) {
    if (image.size > 8_000_000) redirect(`/admin/news/${id}?error=too_large`);
    const ext = extFromMime(image.type);
    if (!ext) redirect(`/admin/news/${id}?error=invalid_type`);
    const fileName = `news-image-${id}-${Date.now()}.${ext}`;
    await writeUpload(fileName, image);
    nextImagePath = fileName;
  }

  await prisma.newsPost.update({
    where: { id },
    data: {
      title,
      slug,
      excerpt: excerpt || null,
      content,
      publishedAt: nextPublishedAt,
      imagePath: nextImagePath
    }
  });

  if (removeImage && current.imagePath) deleteUpload(current.imagePath);
  if (image && image.size > 0 && current.imagePath) deleteUpload(current.imagePath);

  revalidatePath("/news");
  revalidatePath("/");
  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${id}`);
  revalidatePath(`/news/${current.slug}`);
  revalidatePath(`/news/${slug}`);

  redirect(`/admin/news/${id}?ok=1`);
}

export default async function AdminNewsEditPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const post = await prisma.newsPost
    .findUnique({
      where: { id },
      select: { id: true, title: true, slug: true, excerpt: true, content: true, publishedAt: true, imagePath: true }
    })
    .catch(() => null);

  if (!post) {
    return (
      <AdminShell>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">News nicht gefunden</div>
          <div className="mt-4">
            <Link
              href="/admin/news"
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Zurück
            </Link>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-extrabold">News bearbeiten</div>
            <div className="mt-2 text-sm text-white/70">
              {post.publishedAt ? "Veröffentlicht" : "Entwurf"} · /news/{post.slug}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/news/${post.slug}`}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Öffnen
            </Link>
            <Link
              href="/admin/news"
              className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Zurück
            </Link>
          </div>
        </div>

        {ok ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Gespeichert.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Fehler: {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <form action={updateNews} encType="multipart/form-data" className="grid gap-4">
            <input type="hidden" name="id" value={post.id} />
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Titel
              </label>
              <input
                name="title"
                defaultValue={post.title}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Slug
              </label>
              <input
                name="slug"
                defaultValue={post.slug}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
              <div className="mt-1 text-xs text-white/55">
                URL: /news/{post.slug}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Kurztext
              </label>
              <input
                name="excerpt"
                defaultValue={post.excerpt ?? ""}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/70">
                Inhalt
              </label>
              <textarea
                name="content"
                defaultValue={post.content}
                rows={12}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/70">
                  Bild ersetzen (optional)
                </label>
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
                {post.imagePath ? (
                  <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" name="removeImage" className="h-4 w-4" /> Bild entfernen
                  </label>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Vorschau
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <div className="aspect-[16/9] w-full bg-black/30">
                    {post.imagePath ? (
                      <img
                        src={imageUrl(post.imagePath) ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-white/10 via-black/30 to-black/70" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="publish" defaultChecked={Boolean(post.publishedAt)} className="h-4 w-4" />{" "}
              Veröffentlicht
            </label>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-white/55">
                Veröffentlicht: {post.publishedAt ? post.publishedAt.toLocaleString("de-DE") : "—"}
              </div>
              <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Speichern
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
