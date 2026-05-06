import process from "node:process";
import { F1TelemetryClient } from "@deltazeroproduction/f1-udp-parser";

function env(name, fallback = null) {
  const v = process.env[name];
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t ? t : fallback;
}

function envInt(name, fallback) {
  const raw = env(name, null);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function log(...args) {
  process.stdout.write(args.join(" ") + "\n");
}

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const milli = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

const TARGET_URL = env("TELEMETRY_TARGET_URL", "https://mondayracingleaque-production.up.railway.app");
const RACE_ID = env("TELEMETRY_RACE_ID", null);
const TOKEN = env("TELEMETRY_INGEST_TOKEN", null);
const UDP_PORT = envInt("TELEMETRY_UDP_PORT", 20777);
const REPLACE = env("TELEMETRY_REPLACE", "1") !== "0";

if (!RACE_ID) {
  log("TELEMETRY_RACE_ID fehlt (RaceId aus der Admin-URL kopieren).");
  process.exit(1);
}

if (!TOKEN) {
  log("TELEMETRY_INGEST_TOKEN fehlt (muss auf PC und im Backend gesetzt sein).");
  process.exit(1);
}

const client = new F1TelemetryClient({ port: UDP_PORT });

let lastParticipants = [];
let lastParticipantsAt = 0;

client.on("participants", (data) => {
  const list = Array.isArray(data?.m_participants) ? data.m_participants : [];
  lastParticipants = list.map((p, idx) => ({
    carIndex: idx,
    name: typeof p?.m_name === "string" ? p.m_name.trim() : null,
    aiControlled: typeof p?.m_aiControlled === "number" ? p.m_aiControlled : undefined
  }));
  lastParticipantsAt = Date.now();
});

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telemetry-token": TOKEN
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, text, json };
}

client.on("finalClassification", async (data) => {
  const rows = Array.isArray(data?.m_classificationData) ? data.m_classificationData : [];
  if (!rows.length) return;

  const classification = rows.map((r, idx) => ({
    carIndex: idx,
    position: typeof r?.m_position === "number" ? r.m_position : 0,
    gridPosition: typeof r?.m_gridPosition === "number" ? r.m_gridPosition : undefined,
    numPitStops: typeof r?.m_numPitStops === "number" ? r.m_numPitStops : undefined,
    bestLapTimeInMs: typeof r?.m_bestLapTimeInMs === "number" ? r.m_bestLapTimeInMs : undefined,
    totalRaceTime: typeof r?.m_totalRaceTime === "number" ? r.m_totalRaceTime : undefined,
    resultStatus: typeof r?.m_resultStatus === "number" ? r.m_resultStatus : undefined,
    resultReason: typeof r?.m_resultReason === "number" ? r.m_resultReason : undefined,
    points: typeof r?.m_points === "number" ? r.m_points : undefined
  }));

  const payload = {
    raceId: RACE_ID,
    replace: REPLACE,
    participants: lastParticipants,
    classification
  };

  const url = `${TARGET_URL.replace(/\/+$/, "")}/api/telemetry/ingest`;
  const freshness = lastParticipantsAt ? `${Math.round((Date.now() - lastParticipantsAt) / 1000)}s` : "n/a";
  const best = classification
    .map((c) => (typeof c.bestLapTimeInMs === "number" && c.bestLapTimeInMs > 0 ? c.bestLapTimeInMs : null))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  log(
    "FinalClassification empfangen:",
    `cars=${classification.length}`,
    `participantsFresh=${freshness}`,
    best ? `bestLap=${formatMs(best)}` : ""
  );

  try {
    const res = await postJson(url, payload);
    if (res.ok) {
      log("Import OK:", `matched=${res.json?.matched ?? "?"}`, REPLACE ? "replaced=1" : "replaced=0");
    } else {
      log("Import FEHLER:", `status=${res.status}`, res.text.slice(0, 500));
    }
  } catch (e) {
    log("Import FEHLER:", String(e?.message ?? e));
  }
});

client.start();
log("UDP Listener läuft:", `port=${UDP_PORT}`, `raceId=${RACE_ID}`);
log("Ziel:", `${TARGET_URL.replace(/\/+$/, "")}/api/telemetry/ingest`);

process.on("SIGINT", () => {
  try {
    client.stop();
  } catch {}
  process.exit(0);
});

