import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeChannel(input: string) {
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (!/^[a-z0-9_]+$/.test(v)) return null;
  return v;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const channel = normalizeChannel(u.searchParams.get("channel") ?? "");
  if (!channel) return NextResponse.json({ live: false }, { status: 400 });

  try {
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "client-id": "kimne78kx3ncx6brgo4mv6wki5h1ko"
      },
      body: JSON.stringify({
        operationName: "MRLStreamStatus",
        query:
          "query MRLStreamStatus($login: String!) { user(login: $login) { stream { id title createdAt type } } }",
        variables: { login: channel }
      }),
      cache: "no-store"
    });

    if (!res.ok) {
      return NextResponse.json(
        { live: false },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }

    const data = (await res.json()) as {
      data?: { user?: { stream?: { id?: string; title?: string; createdAt?: string; type?: string } | null } | null };
    };

    const stream = data?.data?.user?.stream ?? null;
    const live = Boolean(stream?.id);

    return NextResponse.json(
      {
        live,
        title: stream?.title ?? null,
        startedAt: stream?.createdAt ?? null,
        type: stream?.type ?? null
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { live: false },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}

