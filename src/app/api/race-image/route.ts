function safeText(input: string, maxLen: number) {
  return input.replace(/[\r\n\t]+/g, " ").slice(0, maxLen);
}

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = safeText(url.searchParams.get("title") ?? "Race", 42);
  const meta = safeText(url.searchParams.get("meta") ?? "", 42);
  const accent = safeText(url.searchParams.get("accent") ?? "#E10600", 16);
  const live = url.searchParams.get("live") === "1";

  const t = escapeXml(title);
  const m = escapeXml(meta);
  const a = escapeXml(accent);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0B0D10"/>
      <stop offset="0.6" stop-color="#161A20"/>
      <stop offset="1" stop-color="#0B0D10"/>
    </linearGradient>
    <linearGradient id="stripe" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${a}" stop-opacity="0"/>
      <stop offset="0.45" stop-color="${a}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <path d="M-120 520 C 260 420, 540 610, 940 520 C 1120 480, 1240 470, 1420 420" fill="none" stroke="url(#stripe)" stroke-width="18" opacity="0.8"/>
  <path d="M-120 560 C 260 460, 540 650, 940 560 C 1120 520, 1240 510, 1420 460" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
  <g opacity="0.22">
    <path d="M860 -80 L1440 500" stroke="${a}" stroke-width="6"/>
    <path d="M920 -120 L1500 460" stroke="${a}" stroke-width="3"/>
  </g>
  <g font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" fill="#fff">
    <text x="70" y="115" font-size="18" opacity="0.70">${m}</text>
    <text x="70" y="170" font-size="64" font-weight="800">${t}</text>
  </g>
  ${
    live
      ? `<g>
  <rect x="1090" y="70" width="140" height="44" rx="22" fill="${a}" opacity="0.95"/>
  <text x="1160" y="99" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="16" font-weight="800" fill="#0B0D10">LIVE</text>
</g>`
      : ""
  }
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

