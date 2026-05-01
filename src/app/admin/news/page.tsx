import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";
import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

async function createNews(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const publish = formData.get("publish") === "on";

  if (!title || !content) return;

  const baseSlug = slugify(title);
  let slug = baseSlug || "news";

  const existing = await prisma.newsPost.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  await prisma.newsPost.create({
    data: {
      title,
      slug,
      excerpt: excerpt || null,
      content,
      publishedAt: publish ? new Date() : null
    }
  });

  revalidatePath("/news");
  revalidatePath("/");
  revalidatePath("/admin/news");
}

async function deleteNews(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.newsPost.delete({ where: { id } });
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
  };

  let posts: PostItem[] = [];
  try {
    posts = await prisma.newsPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, slug: true, publishedAt: true }
    });
  } catch {}

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">News anlegen</div>
          <form action={createNews} className="mt-4 grid gap-4">
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
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.title}</div>
                    <div className="mt-1 text-sm text-white/60">
                      {p.publishedAt ? "Veröffentlicht" : "Entwurf"} · /news/
                      {p.slug}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/news/${p.slug}`}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Öffnen
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
