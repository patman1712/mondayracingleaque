import Link from "next/link";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  type NewsListItem = {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    publishedAt: Date | null;
  };

  const now = new Date();
  let posts: NewsListItem[] = [];

  try {
    posts = await prisma.newsPost.findMany({
      where: { publishedAt: { not: null, lte: now } },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true
      }
    });
  } catch {}

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">News</div>
        <div className="mt-2 text-sm text-white/70">
          Aktuelles aus der Monday Racing League
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Noch keine News.
          </div>
        ) : (
          posts.map((p) => (
            <Link
              key={p.id}
              href={`/news/${p.slug}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:bg-white/10"
            >
              <div className="text-lg font-semibold">{p.title}</div>
              <div className="mt-2 text-sm text-white/60">
                {p.publishedAt
                  ? new Date(p.publishedAt).toLocaleDateString("de-DE")
                  : ""}
              </div>
              {p.excerpt ? (
                <div className="mt-3 line-clamp-3 text-sm text-white/75">
                  {p.excerpt}
                </div>
              ) : null}
            </Link>
          ))
        )}
      </div>
    </Container>
  );
}
