import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string(),
  entries: z.array(
    z.object({
      position: z.number(),
      driver: z.string(),
      team: z.string(),
      lap: z.number(),
      gap: z.string(),
      lastLap: z.string(),
      accent: z.string()
    })
  )
});

type LiveTimingEntry = z.infer<typeof schema>["entries"][number];

type LiveTimingState = {
  sessionId: string;
  updatedAtMs: number;
  entries: LiveTimingEntry[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mrlLiveTimingState: LiveTimingState | undefined;
}

function getState(): LiveTimingState {
  if (!globalThis.__mrlLiveTimingState) {
    globalThis.__mrlLiveTimingState = {
      sessionId: "default",
      updatedAtMs: 0,
      entries: []
    };
  }
  return globalThis.__mrlLiveTimingState;
}

function isAuthorized(req: Request) {
  const required = process.env.LIVE_TIMING_TOKEN?.trim() ?? "";
  if (!required) return true;
  const got = req.headers.get("x-live-timing-token")?.trim() ?? "";
  return Boolean(got && got === required);
}

export async function GET() {
  const state = getState();
  return NextResponse.json(
    {
      ok: true,
      sessionId: state.sessionId,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const data = parsed.data;
  const state = getState();

  state.sessionId = data.sessionId;
  state.updatedAtMs = Date.now();
  state.entries = data.entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({ ...e }));

  return NextResponse.json(
    {
      ok: true,
      sessionId: state.sessionId,
      updatedAtMs: state.updatedAtMs,
      entries: state.entries
    },
    { headers: { "cache-control": "no-store" } }
  );
}
