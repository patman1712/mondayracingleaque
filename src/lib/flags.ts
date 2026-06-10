export function flagCodeForText(text: string | null | undefined) {
  const n = (text ?? "").trim().toLowerCase();
  if (!n) return null;
  if (n.includes("australien") || n.includes("australia")) return "au";
  if (n.includes("japan")) return "jp";
  if (n.includes("italien") || n.includes("italy")) return "it";
  if (n.includes("usa") || n.includes("united states") || n.includes("vereinigte staaten")) return "us";
  if (n.includes("mexiko") || n.includes("mexico")) return "mx";
  if (n.includes("kanada") || n.includes("canada")) return "ca";
  if (n.includes("brasil") || n.includes("brazil")) return "br";
  if (n.includes("china")) return "cn";
  if (n.includes("bahrain")) return "bh";
  if (n.includes("saudi")) return "sa";
  if (n.includes("abu dhabi") || n.includes("vereinigte arabische emirate") || n.includes("uae")) return "ae";
  if (n.includes("katar") || n.includes("qatar")) return "qa";
  if (n.includes("singapur") || n.includes("singapore")) return "sg";
  if (n.includes("spanien") || n.includes("spain")) return "es";
  if (n.includes("frankreich") || n.includes("france")) return "fr";
  if (n.includes("monaco")) return "mc";
  if (
    n.includes("großbritannien") ||
    n.includes("grossbritannien") ||
    n.includes("britain") ||
    /\buk\b/.test(n)
  )
    return "gb";
  if (n.includes("niederlande") || n.includes("netherlands") || n.includes("holland")) return "nl";
  if (n.includes("belgien") || n.includes("belgium")) return "be";
  if (n.includes("ungarn") || n.includes("hungary")) return "hu";
  if (n.includes("österreich") || n.includes("osterreich") || n.includes("austria")) return "at";
  if (n.includes("schweiz") || n.includes("switzerland")) return "ch";
  if (n.includes("schweden") || n.includes("sweden")) return "se";
  if (n.includes("finnland") || n.includes("finland")) return "fi";
  if (n.includes("norwegen") || n.includes("norway")) return "no";
  if (n.includes("dänemark") || n.includes("daenemark") || n.includes("denmark")) return "dk";
  if (n.includes("polen") || n.includes("poland")) return "pl";
  if (n.includes("tschechien") || n.includes("czech")) return "cz";
  if (n.includes("rumänien") || n.includes("rumanien") || n.includes("romania")) return "ro";
  if (n.includes("griechenland") || n.includes("greece")) return "gr";
  if (n.includes("portugal")) return "pt";
  if (n.includes("kroatien") || n.includes("croatia")) return "hr";
  if (n.includes("serbien") || n.includes("serbia")) return "rs";
  if (n.includes("irland") || n.includes("ireland")) return "ie";
  if (n.includes("island") || n.includes("iceland")) return "is";
  return null;
}

export function flagCodeForRaceLike(data: {
  name?: string | null;
  location?: string | null;
  circuit?: string | null;
}) {
  const candidates = [data.location, data.circuit, data.name].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  for (const c of candidates) {
    const code = flagCodeForText(c);
    if (code) return code;
  }
  return null;
}

export function flagBackgroundUrl(code: string | null) {
  if (!code) return null;
  return `https://flagcdn.com/${code}.svg`;
}
