"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { downscaleImage, mb } from "@/lib/downscale";
import { objectPositionFor } from "@/components/Photo";

export interface MediaItem {
  id: string;
  url: string;
  cdn_url?: string | null;
  type: string;
  display_order: number;
  /** Colour variant this shot shows; null/undefined = all colours. */
  variant_id?: string | null;
  /** Where the subject is, as "50 28". Null = the default upper third. */
  focus?: string | null;
}

/** Enough of a variant to offer it as a colour choice. */
export interface MediaVariantOption {
  id?: string;
  color: string;
  size?: string;
}

interface Props {
  productId: string;
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  /**
   * The product's variants, so each photograph can be tagged with the colour
   * it shows. Only saved variants (with an id) can be chosen. Omit on the
   * create page, where variants have no ids yet.
   */
  variants?: MediaVariantOption[];
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

export default function MediaUploader({ productId, media, onChange, variants = [] }: Props) {
  // One entry per colour, pointing at the first saved variant of that colour.
  // A photograph is of a colour, not of a size; linking it to one variant row
  // is the storage shape, and the storefront matches on colour from there.
  const colourOptions = Array.from(
    variants.filter((v) => v.id && v.color).reduce((m, v) => (m.has(v.color) ? m : m.set(v.color, v.id as string)), new Map<string, string>())
  );
  const colourOf = (variantId?: string | null) => {
    if (!variantId) return null;
    const v = variants.find((x) => x.id === variantId);
    return v?.color ?? null;
  };
  async function assignColour(item: MediaItem, variantId: string | null) {
    const prev = media;
    onChange(media.map((m) => (m.id === item.id ? { ...m, variant_id: variantId } : m)));
    try {
      await adminApi.patch(`/products/${productId}/media/${item.id}`, { variant_id: variantId });
    } catch {
      onChange(prev);
      setError("Could not save the colour for that photo");
    }
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // drag-reorder state (a mouse convenience; the arrow buttons are the real control)
  const dragIdx = useRef<number | null>(null);

  /** Shrink a file, put it in storage, and say where it went. Throws with a readable message. */
  async function store(file: File): Promise<{ key: string; cdn_url: string; type: string }> {
    if (!ALLOWED.includes(file.type)) throw new Error(`Unsupported type: ${file.type || "unknown"}`);
    if (file.size > 20 * 1024 * 1024) throw new Error("File exceeds 20 MB limit");
    // Shrink it here, before it leaves the phone. An 8 MB camera file is
    // uploaded over her mobile data, stored forever, and downloaded and
    // decoded again by the image optimizer the first time each width is
    // asked for. A 2400px master is twice the widest screen.
    const shrunk = await downscaleImage(file);
    if (shrunk.resized) setNote(`${mb(shrunk.before)} → ${mb(shrunk.after)}`);
    const urlRes = await adminApi.get(`/products/${productId}/media/upload-url`, { params: { content_type: shrunk.contentType } });
    const { upload_url, cdn_url, key } = urlRes.data;
    const put = await fetch(upload_url, { method: "PUT", body: shrunk.file, headers: { "Content-Type": shrunk.contentType } });
    // fetch does not throw on a refused upload. Without this check a failed
    // PUT was still confirmed, leaving a gallery row that points at nothing.
    if (!put.ok) throw new Error(`Storage refused the upload (${put.status})`);
    return { key, cdn_url, type: shrunk.contentType.startsWith("video/") ? "VIDEO" : "IMAGE" };
  }
  const message = (e: any, fallback: string) => e?.response?.data?.detail ?? e?.message ?? fallback;

  /**
   * Add photographs, one after another.
   *
   * They used to upload all at once, each from the same snapshot of the
   * gallery: every one took the same position, and each finish replaced the
   * list with "old list + me", so of five photographs chosen together only
   * the last appeared until the page was reloaded.
   */
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setUploading(true);
    let current = media;
    try {
      for (const file of files) {
        const stored = await store(file);
        const res = await adminApi.post(`/products/${productId}/media/confirm`, { ...stored, display_order: current.length });
        current = [...current, res.data];
        onChange(current);
      }
    } catch (e: any) {
      setError(message(e, "Upload failed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /** Put a new picture where this one is: same position, same colour tag. */
  async function replaceWith(item: MediaItem, file: File) {
    setError(null);
    setBusyId(item.id);
    try {
      const stored = await store(file);
      const res = await adminApi.put(`/products/${productId}/media/${item.id}/replace`, { ...stored, display_order: item.display_order });
      onChange(media.map((m) => (m.id === item.id ? res.data : m)));
    } catch (e: any) {
      setError(message(e, "Could not replace that photo"));
    } finally {
      setBusyId(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  /** Save where the subject is. Optimistic: the crop moves as she taps. */
  async function setFocus(item: MediaItem, x: number | null, y: number | null) {
    const focus = x === null || y === null ? null : `${x} ${y}`;
    onChange(media.map((m) => (m.id === item.id ? { ...m, focus } : m)));
    try {
      await adminApi.patch(`/products/${productId}/media/${item.id}/focus`, { x, y });
    } catch {
      setError("Could not save that crop point.");
    }
  }

  async function deleteMedia(item: MediaItem) {
    if (!confirm("Delete this photo? It cannot be undone.")) return;
    setBusyId(item.id);
    try {
      await adminApi.delete(`/products/${productId}/media/${item.id}`);
      onChange(media.filter((m) => m.id !== item.id).map((m, i) => ({ ...m, display_order: i })));
    } catch (e: any) {
      setError(message(e, "Delete failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function saveOrder(ordered: MediaItem[]) {
    try {
      await adminApi.patch(`/products/${productId}/media/reorder`, {
        items: ordered.map((m, i) => ({ id: m.id, display_order: i })),
      });
    } catch {
      setError("Could not save the new order. Reload to see the saved order.");
    }
  }

  /** Move one place earlier or later. The first photograph is the cover. */
  function move(idx: number, by: -1 | 1) {
    const to = idx + by;
    if (to < 0 || to >= media.length) return;
    const reordered = [...media];
    [reordered[idx], reordered[to]] = [reordered[to], reordered[idx]];
    const numbered = reordered.map((m, i) => ({ ...m, display_order: i }));
    onChange(numbered);
    saveOrder(numbered);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }
  function handleDragEnter(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const reordered = [...media];
    const [moved] = reordered.splice(dragIdx.current, 1);
    reordered.splice(idx, 0, moved);
    dragIdx.current = idx;
    onChange(reordered);
  }
  function handleDragEnd() {
    dragIdx.current = null;
    saveOrder(media);
  }

  const tool = "h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-30";

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-ink bg-ink/5" : "border-gray-200 hover:border-gray-400"
        }`}
      >
        {uploading ? (
          <Loader2 className="mx-auto w-6 h-6 text-gray-400 animate-spin" />
        ) : (
          <>
            <Upload className="mx-auto w-6 h-6 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">
              Add photos: tap to <span className="text-ink font-semibold">choose</span>, or drop them here
            </p>
            <p className="text-xs text-gray-400 mt-1">JPEG · PNG · WebP · MP4 · Max 20 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4"
          multiple
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
      </div>
      {/* One hidden picker shared by every "Replace" button. */}
      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; const item = replacing.current; if (f && item) replaceWith(item, f); }}
      />

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {/* Quiet confirmation that the photograph was shrunk before upload. */}
      {note && !error && <p className="text-xs text-gray-500">Resized before upload: {note}</p>}

      {/* Every control is a visible button. They used to appear only on
          mouse hover, which a phone does not have - so on the phone she runs
          the shop from, a photograph could not be deleted, moved or
          replaced at all. Flex, not a grid: see ui.tsx on implicit tracks. */}
      {media.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {media.map((item, idx) => (
            <div key={item.id} className="w-[calc(50%-6px)] sm:w-44">
              <div
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                className="relative rounded-lg overflow-hidden bg-gray-100 aspect-[3/4]"
              >
                {item.type === "VIDEO" ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">VIDEO</div>
                ) : (
                  // Tap the subject. The storefront crops every photograph to
                  // a fixed ratio and reads the upper third, which is right for
                  // a full-length shot and wrong for a flat-lay or a close-up.
                  // One tap beats guessing per picture.
                  <Image
                    src={item.cdn_url ?? item.url}
                    alt=""
                    fill
                    className="object-cover cursor-crosshair"
                    style={{ objectPosition: objectPositionFor(item.focus) }}
                    sizes="180px"
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setFocus(item, Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100));
                    }}
                  />
                )}
                {busyId === item.id && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-600" /></div>
                )}
                {idx === 0 && <span className="absolute top-1 left-1 bg-ink text-white text-xs px-1.5 py-0.5 rounded">Cover</span>}
                {item.focus && (
                  <button type="button" onClick={() => setFocus(item, null, null)} className="absolute top-1 right-1 bg-white/90 text-ink text-[10px] px-1.5 py-0.5 rounded">
                    reset crop
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span className="flex gap-1">
                  <button type="button" className={tool} disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Move earlier"><ArrowLeft className="w-4 h-4" /></button>
                  <button type="button" className={tool} disabled={idx === media.length - 1} onClick={() => move(idx, 1)} aria-label="Move later"><ArrowRight className="w-4 h-4" /></button>
                </span>
                <span className="flex gap-1">
                  <button type="button" className={tool} disabled={busyId !== null} onClick={() => { replacing.current = item; replaceRef.current?.click(); }} aria-label="Replace this photo" title="Replace this photo"><RefreshCw className="w-4 h-4" /></button>
                  <button type="button" className={`${tool} text-red-600`} disabled={busyId !== null} onClick={() => deleteMedia(item)} aria-label="Delete this photo" title="Delete this photo"><Trash2 className="w-4 h-4" /></button>
                </span>
              </div>
              {colourOptions.length > 0 && (
                <select
                  value={item.variant_id ?? ""}
                  onChange={(e) => assignColour(item, e.target.value || null)}
                  aria-label="Which colour this photo shows"
                  className="mt-1.5 w-full h-9 text-xs rounded-lg px-2 border border-gray-200 bg-white text-gray-700"
                >
                  <option value="">All colours</option>
                  {colourOptions.map(([colour, vid]) => (
                    <option key={vid} value={vid}>{colour}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
      {media.length > 0 && (
        <p className="text-xs text-gray-500">
          The first photo is the cover. Arrows move a photo; the round arrow replaces it in the same place; tap a photo to set where it is cropped.
          {colourOptions.length > 0 && " Tag each photo with the colour it shows and the storefront switches photos when a customer picks that colour."}
        </p>
      )}
    </div>
  );
}
