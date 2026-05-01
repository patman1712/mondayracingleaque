import { Container } from "@/components/Container";
import { missingServerEnvKeys } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  const missing = missingServerEnvKeys([
    "DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH"
  ]);

  return (
    <Container>
      <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-lg font-semibold">Admin noch nicht eingerichtet</div>
        <div className="mt-2 text-sm text-white/70">
          Die öffentliche Website kann ohne Setup laufen. Für den Admin-Bereich
          braucht Railway aber ein paar Variablen.
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Fehlend
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/80">
            {missing.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 text-sm text-white/80">
          Setze die Werte in Railway unter <span className="font-semibold">Variables</span>.
          Danach neu deployen.
        </div>
      </div>
    </Container>
  );
}
