import { Container } from "@/components/Container";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getLeagueColors, leagueLabel, type LeagueKey } from "@/lib/leagueColors";

export const dynamic = "force-dynamic";

function parseMonth(input: string | undefined) {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(input);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

function monthParamFromDate(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  type RaceItem = {
    id: string;
    league: LeagueKey;
    season: number;
    round: number;
    name: string;
    circuit: string | null;
    startsAt: Date;
  };

  const now = new Date();
  const sp = await searchParams;
  const parsed = parseMonth(sp.month);
  const viewMonth = parsed ? new Date(parsed.year, parsed.monthIndex, 1) : startOfMonth(now);
  const prevMonth = addMonths(viewMonth, -1);
  const nextMonth = addMonths(viewMonth, 1);

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = startOfMonth(nextMonth);

  const colors = await getLeagueColors();

  let monthRaces: RaceItem[] = [];
  let upcoming: RaceItem[] = [];

  try {
    const races = await prisma.race.findMany({
      where: { startsAt: { gte: monthStart, lt: monthEnd } },
      orderBy: [{ startsAt: "asc" }],
      take: 500,
      select: {
        id: true,
        league: true,
        season: true,
        round: true,
        name: true,
        circuit: true,
        startsAt: true
      }
    });
    monthRaces = races as unknown as RaceItem[];
  } catch {}

  try {
    const races = await prisma.race.findMany({
      where: { startsAt: { gte: now } },
      orderBy: [{ startsAt: "asc" }],
      take: 18,
      select: {
        id: true,
        league: true,
        season: true,
        round: true,
        name: true,
        circuit: true,
        startsAt: true
      }
    });
    upcoming = races as unknown as RaceItem[];
  } catch {}

  const byDay = new Map<string, RaceItem[]>();
  for (const r of monthRaces) {
    const k = dateKey(r.startsAt);
    const list = byDay.get(k) ?? [];
    list.push(r);
    byDay.set(k, list);
  }

  const gridStart = startOfWeekMonday(monthStart);
  const gridDays: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    gridDays.push(d);
  }

  return (
    <Container>
      <div className="mt-10">
        <div className="text-2xl font-extrabold">Kalender</div>
        <div className="mt-2 text-sm text-white/70">
          Rennen aller Ligen in einer Übersicht
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-white/10 bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="text-lg font-semibold">
              {viewMonth.toLocaleString("de-DE", { month: "long", year: "numeric" })}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/calendar?month=${monthParamFromDate(prevMonth)}`}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                ←
              </Link>
              <Link
                href="/calendar"
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                Heute
              </Link>
              <Link
                href={`/calendar?month=${monthParamFromDate(nextMonth)}`}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
              >
                →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/60">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
              <div key={d} className="px-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((d) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = dateKey(d) === dateKey(now);
              const races = byDay.get(dateKey(d)) ?? [];

              const dots = races.slice(0, 3);
              const more = races.length - dots.length;

              return (
                <div
                  key={d.toISOString()}
                  className={[
                    "min-h-[110px] border-b border-white/10 p-3",
                    "border-r border-white/10",
                    "nth-[7n]:border-r-0"
                  ].join(" ")}
                  style={{ opacity: inMonth ? 1 : 0.45 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                        isToday ? "bg-mrl-red text-white" : "text-white/80"
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </div>
                  </div>

                  {races.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {dots.map((r) => (
                          <div
                            key={r.id}
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: colors[r.league] }}
                            title={`${leagueLabel(r.league)} · ${r.name}`}
                          />
                        ))}
                        {more > 0 ? (
                          <div className="text-xs font-semibold text-white/60">
                            +{more}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1 text-xs text-white/70">
                        {races.slice(0, 2).map((r) => (
                          <div key={r.id} className="truncate">
                            <span
                              className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                              style={{ backgroundColor: colors[r.league] }}
                            />
                            {r.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold">Legende</div>
          <div className="mt-3 space-y-2 text-sm">
            {(["ONE", "TWO", "ROOKIE"] as const).map((l) => (
              <div key={l} className="flex items-center gap-2 text-white/80">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: colors[l] }}
                />
                <div>{leagueLabel(l)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="text-sm font-semibold">Nächste Events</div>
            <div className="mt-3 space-y-2">
              {upcoming.length === 0 ? (
                <div className="text-sm text-white/60">
                  Aktuell sind keine Events geplant.
                </div>
              ) : (
                upcoming.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[r.league] }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {r.name}
                        </div>
                        <div className="mt-1 text-xs text-white/70">
                          {leagueLabel(r.league)} ·{" "}
                          {new Date(r.startsAt).toLocaleString("de-DE", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
