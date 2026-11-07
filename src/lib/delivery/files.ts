/** Browser-safe upload rules for merchant deliverables. The server re-checks everything. */

export const MAX_DELIVERABLE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_TYPES = {
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
  "application/pdf": "PDF document",
} as const;

export type AllowedMime = keyof typeof ALLOWED_TYPES;

export const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

/** Identifies the file from its first bytes, ignoring the name and the browser-declared type. */
export function detectFileType(bytes: Uint8Array): AllowedMime | null {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (start: number, text: string) => [...text].every((c, i) => at(start + i) === c.charCodeAt(0));
  if (at(0) === 0x89 && ascii(1, "PNG") && at(4) === 0x0d && at(5) === 0x0a) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(0, "%PDF-")) return "application/pdf";
  return null;
}

export type FileCheck = { ok: true; mime: AllowedMime } | { ok: false; error: string };

export function checkDeliverable(bytes: Uint8Array): FileCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (bytes.byteLength > MAX_DELIVERABLE_BYTES) return { ok: false, error: "The file is larger than 10 MB." };
  const mime = detectFileType(bytes);
  if (!mime) return { ok: false, error: "Only PNG, JPEG, WebP images and PDF documents are accepted." };
  return { ok: true, mime };
}

/** Keeps a readable, storage-safe file name. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(-100);
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
