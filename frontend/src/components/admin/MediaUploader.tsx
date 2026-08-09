"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, GripVertical, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

export interface MediaItem {
  id: string;
  url: string;
  cdn_url?: string | null;
  type: string;
  display_order: number;
}

interface Props {
  productId: string;
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

export default function MediaUploader({ productId, media, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // drag-reorder state
  const dragIdx = useRef<number | null>(null);

  async function uploadFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      setError(`Unsupported type: ${file.type}`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File exceeds 20 MB limit");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // 1. Get presigned URL
      const urlRes = await adminApi.get(`/products/${productId}/media/upload-url`, {
        params: { content_type: file.type },
      });
      const { upload_url, cdn_url, key } = urlRes.data;

      // 2. PUT directly to R2 (or dev placeholder)
      await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      // 3. Confirm upload → creates ProductMedia record
      const mediaType = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
      const confirmRes = await adminApi.post(`/products/${productId}/media/confirm`, {
        key,
        cdn_url,
        type: mediaType,
        display_order: media.length,
      });

      onChange([...media, confirmRes.data]);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteMedia(item: MediaItem) {
    try {
      await adminApi.delete(`/products/${productId}/media/${item.id}`);
      const updated = media
        .filter((m) => m.id !== item.id)
        .map((m, i) => ({ ...m, display_order: i }));
      onChange(updated);
    } catch {
      setError("Delete failed");
    }
  }

  async function saveOrder(ordered: MediaItem[]) {
    try {
      await adminApi.patch(`/products/${productId}/media/reorder`, {
        items: ordered.map((m, i) => ({ id: m.id, display_order: i })),
      });
    } catch {
      // non-fatal — local order already updated
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  }

  // Drag-to-reorder
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

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? "border-[#5C3317] bg-[#5C3317]/5" : "border-gray-200 hover:border-gray-400"
        }`}
      >
        {uploading ? (
          <Loader2 className="mx-auto w-6 h-6 text-gray-400 animate-spin" />
        ) : (
          <>
            <Upload className="mx-auto w-6 h-6 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">
              Drop images/video here or <span className="text-[#5C3317] font-semibold">browse</span>
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
          onChange={(e) => Array.from(e.target.files ?? []).forEach(uploadFile)}
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Thumbnail grid with drag-reorder */}
      {media.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {media.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              className="relative group rounded-lg overflow-hidden bg-gray-100 aspect-square cursor-grab"
            >
              {item.type === "VIDEO" ? (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  VIDEO
                </div>
              ) : (
                <Image
                  src={item.cdn_url ?? item.url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="100px"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); deleteMedia(item); }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
              <GripVertical className="absolute bottom-1 left-1 w-3 h-3 text-white opacity-0 group-hover:opacity-70" />
              {idx === 0 && (
                <span className="absolute top-1 left-1 bg-[#5C3317] text-white text-xs px-1 rounded">
                  Cover
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
