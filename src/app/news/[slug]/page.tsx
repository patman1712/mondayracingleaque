import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewsArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await prisma.newsPost
    .findUnique({
      where: { slug },
      select: {
        title: true,
        excerpt: true,
        content: true,
        publishedAt: true
      }
    })
    .catch(() => null);

  if (!post || !post.publishedAt) notFound();

  return (
    <Container>
      <article className="mx-auto mt-10 max-w-3xl">
        <div className="text-sm text-white/60">
          {new Date(post.publishedAt).toLocaleDateString("de-DE")}
        </div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          {post.title}
        </h1>
        {post.excerpt ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/80">
            {post.excerpt}
          </div>
        ) : null}
        <div className="mt-6 whitespace-pre-wrap leading-relaxed text-white/85">
          {post.content}
        </div>
      </article>
    </Container>
  );
}
