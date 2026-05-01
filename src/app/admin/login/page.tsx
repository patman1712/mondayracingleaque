import { Container } from "@/components/Container";
import { LoginForm } from "./LoginForm";
import { Suspense } from "react";

export default function AdminLoginPage() {
  return (
    <Container>
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-lg font-semibold">Admin Login</div>
        <div className="mt-1 text-sm text-white/70">
          Bitte einloggen, um Inhalte zu verwalten.
        </div>
        <div className="mt-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </Container>
  );
}
