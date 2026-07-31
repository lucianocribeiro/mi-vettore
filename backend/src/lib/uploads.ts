import fs from "fs";
import path from "path";

/** En Vercel/Lambda solo /tmp es escribible (y efímero). */
export function getUploadsRoot(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "uploads");
  }
  return path.join(process.cwd(), "uploads");
}

/** Crea subcarpetas bajo uploads; no tira si el FS es de solo lectura. */
export function ensureUploadDirs(...subdirs: string[]): string {
  const root = getUploadsRoot();
  for (const dir of [root, ...subdirs.map((s) => path.join(root, s))]) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn(`[uploads] no se pudo crear ${dir}:`, err);
    }
  }
  return root;
}
