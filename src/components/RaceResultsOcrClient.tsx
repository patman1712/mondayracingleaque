"use client";

import { useMemo, useState } from "react";

export function RaceResultsOcrClient({ formId, imageUrls }: { formId: string; imageUrls: string[] }) {
  const urls = useMemo(() => imageUrls.filter(Boolean).slice(0, 20), [imageUrls]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  type OcrWorker = {
    recognize: (image: string) => Promise<{ data?: { text?: string | null } }>;
    terminate: () => Promise<unknown>;
  };

  async function runOcr() {
    if (running) return;
    if (urls.length === 0) {
      setError("Keine Bilder vorhanden.");
      return;
    }

    setRunning(true);
    setError(null);
    setProgress("OCR startet…");

    let worker: OcrWorker | null = null;

    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng");

      const texts: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        setProgress(`Bild ${i + 1}/${urls.length}…`);
        const res = await worker.recognize(urls[i]);
        const text = String(res?.data?.text ?? "").trim();
        if (text) texts.push(text);
      }

      const combined = texts.join("\n\n").trim();
      if (!combined) {
        setError("OCR hat keinen Text erkannt.");
        setProgress(null);
        return;
      }

      const form = document.getElementById(formId) as HTMLFormElement | null;
      const field = form?.elements.namedItem("ocrText") as HTMLTextAreaElement | null;
      if (!form || !field) {
        setError("Formular nicht gefunden.");
        setProgress(null);
        return;
      }

      field.value = combined;
      setProgress("Import…");
      form.requestSubmit();
    } catch (e) {
      const msg =
        typeof e === "object" && e && "message" in e ? String((e as { message?: unknown }).message ?? "") : String(e ?? "");
      setError(msg ? msg.slice(0, 160) : "OCR Fehler");
      setProgress(null);
    } finally {
      try {
        await worker?.terminate();
      } catch {}
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runOcr}
        disabled={running || urls.length === 0}
        className="mt-3 w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {running ? "OCR läuft…" : "OCR aus Bildern → Ergebnisse eintragen"}
      </button>
      {progress ? <div className="text-xs text-white/70">{progress}</div> : null}
      {error ? <div className="text-xs text-white/70">{error}</div> : null}
    </div>
  );
}
