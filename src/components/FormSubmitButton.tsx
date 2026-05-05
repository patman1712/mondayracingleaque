"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  className,
  children,
  pendingText
}: {
  className?: string;
  children: React.ReactNode;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className + (pending ? " opacity-70" : "")}>
      {pending ? pendingText ?? children : children}
    </button>
  );
}

