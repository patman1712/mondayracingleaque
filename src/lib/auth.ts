import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { getServerEnv, missingServerEnvKeys } from "@/lib/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export function isAuthConfigured() {
  const missing = missingServerEnvKeys([
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH"
  ]);
  return missing.length === 0;
}

export function getAuthOptions(): NextAuthOptions {
  const env = getServerEnv();

  return {
    secret: env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },
    pages: {
      signIn: "/admin/login"
    },
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "text" },
          password: { label: "Passwort", type: "password" }
        },
        async authorize(credentials) {
          const parsed = credentialsSchema.safeParse(credentials);
          if (!parsed.success) return null;

          if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH) return null;

          const { email, password } = parsed.data;
          if (email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return null;

          const ok = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);
          if (!ok) return null;

          return { id: "admin", name: "Admin", email: env.ADMIN_EMAIL };
        }
      })
    ]
  };
}
