"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
      onClick={() => signOut({ callbackUrl: "/" })}
      type="button"
    >
      Logout
    </button>
  );
}
