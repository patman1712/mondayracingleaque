"use client";

import { useMemo, useState } from "react";

export function RaceResultsOcrClient({ formId, imageUrls }: { formId: string; imageUrls: string[] }) {
  const urls = useMemo(() => imageUrls.filter(Boolean).slice(0, 20), [imageUrls]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [cropTop, setCropTop] = useState(6);
  const [cropBottom, setCropBottom] = useState(2);
  const [cropLeft, setCropLeft] = useState(6);
  const [cropRight, setCropRight] = useState(2);

  type OcrWorker = {
    recognize: (image: HTMLCanvasElement) => Promise<{ data?: { text?: string | null } }>;
    setParameters?: (params: Record<string, string>) => Promise<unknown>;
    terminate: () => Promise<unknown>;
  };

  function clampPct(n: number) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(25, Math.round(n)));
  }

  function otsuThreshold(hist: Uint32Array, total: number) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let max = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) {
        max = between;
        threshold = t;
      }
    }

    return threshold;
  }

  async function imageToCanvas(url: string) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Bild konnte nicht geladen werden");
    const blob = await res.blob();

    if ("createImageBitmap" in window) {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas nicht verfügbar");
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return c;
    }

    const objUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = objUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas nicht verfügbar");
      ctx.drawImage(img, 0, 0);
      return c;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  async function preprocess(url: string) {
    const src = await imageToCanvas(url);
    const w = src.width;
    const h = src.height;

    const ct = clampPct(cropTop) / 100;
    const cb = clampPct(cropBottom) / 100;
    const cl = clampPct(cropLeft) / 100;
    const cr = clampPct(cropRight) / 100;

    const x = Math.max(0, Math.floor(w * cl));
    const y = Math.max(0, Math.floor(h * ct));
    const cw = Math.max(1, Math.floor(w * (1 - cl - cr)));
    const ch = Math.max(1, Math.floor(h * (1 - ct - cb)));

    const targetBaseW = 1800;
    const scale = Math.max(1, Math.min(3, targetBaseW / cw));
    const tw = Math.max(1, Math.min(2600, Math.round(cw * scale)));
    const th = Math.max(1, Math.round(ch * (tw / cw)));

    const out = document.createElement("canvas");
    out.width = tw;
    out.height = th;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas nicht verfügbar");

    ctx.imageSmoothingEnabled = true;
    const ctx2 = ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string };
    if (typeof ctx2.imageSmoothingQuality !== "undefined") ctx2.imageSmoothingQuality = "high";

    ctx.drawImage(src, x, y, cw, ch, 0, 0, tw, th);

    const img = ctx.getImageData(0, 0, tw, th);
    const data = img.data;
    const hist = new Uint32Array(256);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
      hist[gray] += 1;
    }

    const t = otsuThreshold(hist, tw * th);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
      const v = gray < t ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    return out;
  }

  async function runOcr() {
    if (running) return;
    if (urls.length === 0) {
      setError("Keine Bilder vorhanden.");
      return;
    }

    setRunning(true);
    setError(null);
    setProgress("OCR startet…");
    setPreviewUrl(null);

    let worker: OcrWorker | null = null;

    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng");
      await worker.setParameters?.({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: "6",
        tessedit_char_blacklist: "[]{}()|"
      });

      const texts: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        setProgress(`Bild ${i + 1}/${urls.length} vorbereiten…`);
        const canvas = await preprocess(urls[i]);
        if (preview && i === 0) {
          try {
            setPreviewUrl(canvas.toDataURL("image/png"));
          } catch {}
        }
        setProgress(`Bild ${i + 1}/${urls.length} OCR…`);
        const res = await worker.recognize(canvas);
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
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runOcr}
          disabled={running || urls.length === 0}
          className="mt-3 w-fit rounded-lg bg-mrl-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {running ? "OCR läuft…" : "OCR aus Bildern → Ergebnisse eintragen"}
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-3 w-fit rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
        >
          {showAdvanced ? "Erweitert ausblenden" : "Erweitert"}
        </button>
      </div>
      {showAdvanced ? (
        <div className="mt-2 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-white/80 md:col-span-2">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} className="h-4 w-4" />{" "}
            Preview Preprocessing (erstes Bild)
          </label>
          <label className="text-sm text-white/80">
            Crop oben (%)
            <input
              type="number"
              min={0}
              max={25}
              value={cropTop}
              onChange={(e) => setCropTop(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </label>
          <label className="text-sm text-white/80">
            Crop unten (%)
            <input
              type="number"
              min={0}
              max={25}
              value={cropBottom}
              onChange={(e) => setCropBottom(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </label>
          <label className="text-sm text-white/80">
            Crop links (%)
            <input
              type="number"
              min={0}
              max={25}
              value={cropLeft}
              onChange={(e) => setCropLeft(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </label>
          <label className="text-sm text-white/80">
            Crop rechts (%)
            <input
              type="number"
              min={0}
              max={25}
              value={cropRight}
              onChange={(e) => setCropRight(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
            />
          </label>
          {previewUrl ? (
            <div className="md:col-span-2">
              <div className="text-xs text-white/60">Preview</div>
              <img src={previewUrl} alt="" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30" />
            </div>
          ) : null}
        </div>
      ) : null}
      {progress ? <div className="text-xs text-white/70">{progress}</div> : null}
      {error ? <div className="text-xs text-white/70">{error}</div> : null}
    </div>
  );
}
