import { AdminShell } from "@/components/AdminShell";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

function asUploadFile(v: unknown): File | null {
  if (!v || typeof v !== "object") return null;
  const f = v as { arrayBuffer?: unknown; size?: unknown; type?: unknown };
  if (typeof f.arrayBuffer !== "function") return null;
  if (typeof f.size !== "number") return null;
  if (typeof f.type !== "string") return null;
  return v as File;
}

async function writeUpload(fileName: string, file: File) {
  const root = dataRootDir();
  const uploads = path.join(root, "uploads");
  ensureDir(uploads);
  const abs = path.join(uploads, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(abs, buf);
}

function deleteUpload(fileName: string | null | undefined) {
  if (!fileName) return;
  const abs = path.join(dataRootDir(), "uploads", fileName);
  try {
    fs.unlinkSync(abs);
  } catch {}
}

function imageUrl(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  return `/api/uploads/${encodeURIComponent(imagePath)}`;
}

async function saveLogo(formData: FormData) {
  "use server";
  await requireAdmin();

  const file = asUploadFile(formData.get("logo"));
  if (!file || file.size <= 0) redirect("/admin/settings/appearance?error=invalid");
  if (file.size > 8_000_000) redirect("/admin/settings/appearance?error=too_large");
  const ext = extFromMime(file.type);
  if (!ext) redirect("/admin/settings/appearance?error=invalid_type");

  const current = await prisma.appConfig
    .findUnique({ where: { key: "branding:logoPath" }, select: { value: true } })
    .catch(() => null);

  const fileName = `app-logo-${Date.now()}.${ext}`;
  await writeUpload(fileName, file);

  await prisma.appConfig.upsert({
    where: { key: "branding:logoPath" },
    create: { key: "branding:logoPath", value: fileName },
    update: { value: fileName }
  });

  deleteUpload(current?.value ?? null);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

async function removeLogo() {
  "use server";
  await requireAdmin();

  const current = await prisma.appConfig
    .findUnique({ where: { key: "branding:logoPath" }, select: { value: true } })
    .catch(() => null);
  deleteUpload(current?.value ?? null);
  await prisma.appConfig.delete({ where: { key: "branding:logoPath" } }).catch(() => null);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

async function saveHomeHero(formData: FormData) {
  "use server";
  await requireAdmin();

  const file = asUploadFile(formData.get("hero"));
  if (!file || file.size <= 0) redirect("/admin/settings/appearance?error=invalid");
  if (file.size > 12_000_000) redirect("/admin/settings/appearance?error=too_large");
  const ext = extFromMime(file.type);
  if (!ext) redirect("/admin/settings/appearance?error=invalid_type");

  const current = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroImagePath" }, select: { value: true } })
    .catch(() => null);

  const fileName = `home-hero-${Date.now()}.${ext}`;
  await writeUpload(fileName, file);

  await prisma.appConfig.upsert({
    where: { key: "branding:homeHeroImagePath" },
    create: { key: "branding:homeHeroImagePath", value: fileName },
    update: { value: fileName }
  });

  deleteUpload(current?.value ?? null);
  revalidatePath("/");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

async function removeHomeHero() {
  "use server";
  await requireAdmin();

  const current = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroImagePath" }, select: { value: true } })
    .catch(() => null);
  deleteUpload(current?.value ?? null);
  await prisma.appConfig.delete({ where: { key: "branding:homeHeroImagePath" } }).catch(() => null);
  revalidatePath("/");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

async function saveHomeHeroText(formData: FormData) {
  "use server";
  await requireAdmin();

  const badge = String(formData.get("badge") ?? "").trim();
  const headlinePrimary = String(formData.get("headlinePrimary") ?? "").trim();
  const headlineAccent = String(formData.get("headlineAccent") ?? "").trim();
  const subline = String(formData.get("subline") ?? "").trim();

  async function setKey(key: string, v: string) {
    if (!v) {
      await prisma.appConfig.delete({ where: { key } }).catch(() => null);
      return;
    }
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: v },
      update: { value: v }
    });
  }

  await setKey("branding:homeHeroBadge", badge);
  await setKey("branding:homeHeroHeadlinePrimary", headlinePrimary);
  await setKey("branding:homeHeroHeadlineAccent", headlineAccent);
  await setKey("branding:homeHeroSubline", subline);

  revalidatePath("/");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

async function removeHomeHeroText() {
  "use server";
  await requireAdmin();

  const keys = [
    "branding:homeHeroBadge",
    "branding:homeHeroHeadlinePrimary",
    "branding:homeHeroHeadlineAccent",
    "branding:homeHeroSubline"
  ];
  for (const k of keys) await prisma.appConfig.delete({ where: { key: k } }).catch(() => null);
  revalidatePath("/");
  revalidatePath("/admin/settings/appearance");
  redirect("/admin/settings/appearance?ok=1");
}

export default async function AdminAppearancePage({
  searchParams
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const ok = sp.ok === "1";
  const error = sp.error ?? null;

  const logoRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:logoPath" }, select: { value: true } })
    .catch(() => null);
  const heroRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroImagePath" }, select: { value: true } })
    .catch(() => null);
  const heroBadgeRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroBadge" }, select: { value: true } })
    .catch(() => null);
  const heroHeadlinePrimaryRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroHeadlinePrimary" }, select: { value: true } })
    .catch(() => null);
  const heroHeadlineAccentRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroHeadlineAccent" }, select: { value: true } })
    .catch(() => null);
  const heroSublineRow = await prisma.appConfig
    .findUnique({ where: { key: "branding:homeHeroSubline" }, select: { value: true } })
    .catch(() => null);

  const logoPath = logoRow?.value ? String(logoRow.value) : null;
  const heroPath = heroRow?.value ? String(heroRow.value) : null;
  const heroBadge = heroBadgeRow?.value ? String(heroBadgeRow.value) : "";
  const heroHeadlinePrimary = heroHeadlinePrimaryRow?.value ? String(heroHeadlinePrimaryRow.value) : "";
  const heroHeadlineAccent = heroHeadlineAccentRow?.value ? String(heroHeadlineAccentRow.value) : "";
  const heroSubline = heroSublineRow?.value ? String(heroSublineRow.value) : "";
  const hasHeroText = Boolean(heroBadge || heroHeadlinePrimary || heroHeadlineAccent || heroSubline);

  return (
    <AdminShell>
      <div className="space-y-6">
        {ok ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Gespeichert.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
            Fehler: {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Branding</div>
          <div className="mt-1 text-sm text-white/60">
            Logo wird im Header genutzt und als Favicon gesetzt.
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Logo
              </div>
              <div className="mt-3 flex items-center gap-3">
                {logoPath ? (
                  <img
                    src={imageUrl(logoPath) ?? ""}
                    alt=""
                    className="h-14 w-14 rounded-full bg-black/20 object-contain ring-1 ring-white/10"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-black/20 ring-1 ring-white/10" />
                )}
                <div className="text-sm text-white/70">
                  {logoPath ? "Aktiv" : "Standard"}
                </div>
              </div>

              <form
                action={saveLogo}
                encType="multipart/form-data"
                className="mt-4 grid gap-3"
              >
                <input
                  name="logo"
                  type="file"
                  accept="image/png,image/svg+xml,image/webp,image/jpeg"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
                <div className="flex items-center justify-between gap-2">
                  {logoPath ? (
                    <button
                      formAction={removeLogo}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Entfernen
                    </button>
                  ) : (
                    <div />
                  )}
                  <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                    Speichern
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Home Hero Bild
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <div className="aspect-[16/9] w-full bg-black/30">
                  {heroPath ? (
                    <img
                      src={imageUrl(heroPath) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </div>

              <form
                action={saveHomeHero}
                encType="multipart/form-data"
                className="mt-4 grid gap-3"
              >
                <input
                  name="hero"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
                />
                <div className="flex items-center justify-between gap-2">
                  {heroPath ? (
                    <button
                      formAction={removeHomeHero}
                      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      Entfernen
                    </button>
                  ) : (
                    <div />
                  )}
                  <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-base font-semibold">Home Hero Text</div>
          <div className="mt-1 text-sm text-white/60">
            Überschreibt die Texte auf der Startseite.
          </div>

          <form action={saveHomeHeroText} className="mt-5 grid gap-3">
            <input
              name="badge"
              defaultValue={heroBadge}
              placeholder="Badge (z.B. Season 2026)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="headlinePrimary"
                defaultValue={heroHeadlinePrimary}
                placeholder="Headline links (z.B. ONE LEAQUE)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
              <input
                name="headlineAccent"
                defaultValue={heroHeadlineAccent}
                placeholder="Headline rot (z.B. ONE FAMILY)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
              />
            </div>
            <input
              name="subline"
              defaultValue={heroSubline}
              placeholder="Subline (z.B. Monday Racing League · F1 26 Simracing Liga)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />

            <div className="flex items-center justify-between gap-2">
              {hasHeroText ? (
                <button
                  formAction={removeHomeHeroText}
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Zurücksetzen
                </button>
              ) : (
                <div />
              )}
              <button className="rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white">
                Speichern
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
