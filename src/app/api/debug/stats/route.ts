import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [adminUsers, races, drivers, newsPosts, appConfig] = await Promise.all([
    prisma.adminUser.count().catch(() => -1),
    prisma.race.count().catch(() => -1),
    prisma.driver.count().catch(() => -1),
    prisma.newsPost.count().catch(() => -1),
    prisma.appConfig.count().catch(() => -1)
  ]);

  return Response.json(
    {
      adminUsers,
      races,
      drivers,
      newsPosts,
      appConfig
    },
    { headers: { "cache-control": "no-store" } }
  );
}
