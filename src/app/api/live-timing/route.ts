import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EntrySchema = z.object({
  position: z.number().int().min(1).max(50),
  driver: z.string().trim().min(1),
  team: z.string().trim().min(1).nullable().optional(),
  lap: z.number().int().min(0).max(999).nullable().optional(),
  gap: z.string().trim().min(1).nullable().optional(),
  lastLap: z.string().trim().min(1).nullable().optional(),
  accent: z.string().trim().min(1).nullable().optional(),
  portraitUrl: z.string().trim().min(1).nullable().optional(),
  teamLogoUrl: z.string().trim().min(1).nullable().optional()
});

const PostSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  updatedAtMs: z.number().int().optional(),
  entries: z.array(EntrySchema).max(60)
});

type LiveTimingEntry = z.infer<typeof EntrySchema>;

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

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const data = parsed.data;
  const state = getState();

  state.sessionId = data.sessionId ?? state.sessionId ?? "default";
  state.updatedAtMs = data.updatedAtMs ?? Date.now();
  state.entries = data.entries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      ...e,
      team: e.team ?? null,
      lap: typeof e.lap === "number" ? e.lap : null,
      gap: e.gap ?? null,
      lastLap: e.lastLap ?? null,
      accent: e.accent ?? null,
      portraitUrl: e.portraitUrl ?? null,
      teamLogoUrl: e.teamLogoUrl ?? null
    }));

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

