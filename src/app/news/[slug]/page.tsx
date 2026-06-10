import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

export default async function NewsArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = (await prisma.newsPost.findUnique({ where: { slug } }).catch(() => null)) as
    | {
        title: string;
        excerpt: string | null;
        content: string;
        imagePath?: string | null;
        publishedAt: Date | null;
      }
    | null;

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
        {post.imagePath ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <img
              src={imageUrl(post.imagePath) ?? ""}
              alt=""
              className="mx-auto block h-auto max-h-[560px] w-full object-contain"
            />
          </div>
        ) : null}
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
