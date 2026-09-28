import fs from "node:fs";
import path from "node:path";

function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

export function dataRootDir() {
  const railwayMount = "/app/data";
  if (fs.existsSync(railwayMount)) return railwayMount;
  return path.join(process.cwd(), "data");
}

export async function writeStreamedFile(
  fileName: string,
  file: File
): Promise<void> {
  const uploadsDir = path.join(dataRootDir(), "uploads");
  ensureDir(uploadsDir);
  const abs = path.join(uploadsDir, fileName);
  ensureDir(path.dirname(abs));

  const out = fs.createWriteStream(abs);
  try {
    const reader = (file.stream() as unknown as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const value = result.value;
      if (value) {
        const keepWriting = out.write(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        if (!keepWriting) {
          await new Promise<void>((resolve, reject) => {
            out.once("drain", () => resolve());
            out.once("error", (e) => reject(e));
          });
        }
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      out.end((err: unknown) => (err ? reject(err) : resolve()));
    });
  }
}
