"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Upload a logo, banner or background from the computer or phone.
 * Accepts JPG, PNG, WebP, SVG (and GIF, first frame). Every file is redrawn
 * in the browser and saved as a small WebP, so a 5 MB phone photo or a heavy
 * SVG never reaches the players' phones. Transparent logos stay transparent.
 */
export type ImageKind = "logo" | "banner" | "background" | "offer";

const SPEC: Record<ImageKind, { maxW: number; maxH: number; targetKB: number; hint: string }> = {
  logo: { maxW: 512, maxH: 512, targetKB: 60, hint: "Logo: SVG or PNG with a transparent background is best. Saved at up to 512 px, about 60 KB." },
  banner: { maxW: 1200, maxH: 400, targetKB: 180, hint: "Banner: 3:1 shape, for example 1200 x 400. Saved at about 180 KB or less." },
  offer: { maxW: 1280, maxH: 720, targetKB: 200, hint: "Offer image: 16:9, for example 1280 x 720. Saved at about 200 KB or less." },
  background: { maxW: 1080, maxH: 1920, targetKB: 250, hint: "Background: a tall phone-shaped image, 1080 x 1920. Keep it dark so text stays readable. Saved at about 250 KB or less." },
};
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const MAX_INPUT_MB = 15;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file couldn't be read as an image."));
    img.src = url;
  });
}

// Older Safari can't encode WebP and silently returns PNG. Then logos stay PNG
// (to keep transparency) and photos fall back to JPEG.
function toBlob(canvas: HTMLCanvasElement, q: number, kind: ImageKind): Promise<Blob | null> {
  return new Promise((r) =>
    canvas.toBlob((b) => {
      if (b && b.type === "image/webp") return r(b);
      if (kind === "logo") return canvas.toBlob(r, "image/png");
      canvas.toBlob(r, "image/jpeg", q);
    }, "image/webp", q),
  );
}

export async function shrinkImage(file: File, kind: ImageKind): Promise<Blob> {
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_INPUT_MB} MB. Export a smaller version first.`);
  const spec = SPEC[kind];
  const img = await loadImage(file);
  // SVGs without a fixed size report 0 or a tiny size; draw them at the full target size.
  let w = img.naturalWidth || spec.maxW;
  let h = img.naturalHeight || spec.maxH;
  const isSvg = file.type === "image/svg+xml";
  const scale = isSvg ? Math.min(spec.maxW / w, spec.maxH / h) : Math.min(1, spec.maxW / w, spec.maxH / h);
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process the image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.86, 0.76, 0.66, 0.56]) {
      blob = await toBlob(canvas, q, kind);
      if (blob && blob.size <= spec.targetKB * 1024) return blob;
    }
    w = Math.round(w * 0.8);
    h = Math.round(h * 0.8);
  }
  if (!blob) throw new Error("Your browser couldn't process the image.");
  if (blob.size > 1024 * 1024) throw new Error("This image is still too heavy after shrinking. Try a simpler version.");
  return blob;
}

export function ImageUpload({
  kind,
  label,
  value,
  onChange,
  required,
}: {
  kind: ImageKind;
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [size, setSize] = useState<string>("");
  const [paste, setPaste] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const blob = await shrinkImage(file, kind);
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${kind}/${crypto.randomUUID()}.${ext}`;
      const sb = supabase();
      const { error } = await sb.storage.from("brand-assets").upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      onChange(sb.storage.from("brand-assets").getPublicUrl(path).data.publicUrl);
      setSize(`${Math.round(blob.size / 1024)} KB`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const box = kind === "logo" ? "h-16 w-16" : kind === "banner" ? "h-16 w-48" : kind === "offer" ? "h-16 w-28" : "h-28 w-16";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-[#17201f]">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-[#b9c3bf] bg-[#f3f5f4] bg-[length:12px_12px] text-xs text-[#5b6865]`}
          style={{ backgroundImage: "linear-gradient(45deg,#e6eae8 25%,transparent 25%,transparent 75%,#e6eae8 75%),linear-gradient(45deg,#e6eae8 25%,transparent 25%,transparent 75%,#e6eae8 75%)", backgroundPosition: "0 0,6px 6px" }}
          aria-label={value ? `Replace ${label}` : `Upload ${label}`}
        >
          {busy ? (
            "..."
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain" />
          ) : (
            "+ Add"
          )}
        </button>
        <div className="flex flex-col gap-1 text-xs">
          <span className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-line !px-2 !py-1" onClick={() => input.current?.click()} disabled={busy}>
              {value ? "Replace" : "Upload file"}
            </button>
            {value && (
              <button type="button" className="btn btn-line !px-2 !py-1" onClick={() => { onChange(null); setSize(""); }}>
                Remove
              </button>
            )}
            <button type="button" className="underline text-[#3b4745]" onClick={() => setPaste((p) => !p)}>
              {paste ? "Hide link" : "Or paste a link"}
            </button>
          </span>
          <span className="text-[#5b6865]">{SPEC[kind].hint}{size && ` Uploaded: ${size}.`}</span>
        </div>
      </div>
      {paste && (
        <input
          type="url"
          placeholder="https://..."
          defaultValue={value ?? ""}
          onBlur={(e) => onChange(e.target.value.trim() || null)}
        />
      )}
      {err && <span className="text-sm text-red-700">{err}</span>}
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
