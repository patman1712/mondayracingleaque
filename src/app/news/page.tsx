import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export default async function NewsPage() {
  type NewsListItem = {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    publishedAt: Date | null;
    imagePath?: string | null;
  };

  const now = new Date();
  let posts: NewsListItem[] = [];

  try {
    posts = (await prisma.newsPost.findMany({
      where: { publishedAt: { not: null, lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 50
    })) as unknown as NewsListItem[];
  } catch {}

  return (
    <div className="w-full px-4 py-10 md:px-10">
      <div>
        <div className="text-2xl font-extrabold">News</div>
        <div className="mt-2 text-sm text-white/70">
          Aktuelles aus der Monday Racing League
        </div>
      </div>

      <div className="mt-6 grid auto-rows-[240px] gap-4 md:grid-cols-2 md:auto-rows-[280px]">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine News.
          </div>
        ) : (
          posts.map((p, i) => {
            const span = i === 0 || i === 3 ? "md:row-span-2" : "";
            return (
              <Link
                key={p.id}
                href={`/news/${p.slug}`}
                className={[
                  "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5",
                  span
                ].join(" ")}
              >
                <div className="absolute inset-0 bg-black/20">
                  {p.imagePath ? (
                    <img
                      src={imageUrl(p.imagePath) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-white/10 via-black/30 to-black/70" />
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="max-w-xl rounded-xl border border-white/10 bg-mrl-red px-4 py-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                      Article
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="line-clamp-2 text-sm font-extrabold">
                        {p.title}
                      </div>
                      <div className="shrink-0 text-lg font-extrabold">→</div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
