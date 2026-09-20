"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Category } from "@/lib/queries/catalog";

const FALLBACK_IMAGE = "/placeholder-product.svg";

/**
 * A category as a tall tile with its name set into the photograph.
 *
 * The name lives on the image rather than under it so the rail reads as a
 * row of doors, not a row of thumbnails with captions. The count sits small
 * beside it: "12 pieces" is an honest number for a small label and reads as
 * curation, where "12 items" reads as a stock report.
 */
export function CategoryCard({ category }: { category: Category }) {
  const router = useRouter();
  const n = category.product_count;
  return (
    <button
      type="button"
      className="flex-shrink-0 w-[150px] lg:w-[210px] text-left group"
      onClick={() => router.push(`/category/${category.slug}`)}
      aria-label={`${category.name}, ${n} ${n === 1 ? "piece" : "pieces"}`}
    >
      <div className="relative w-full aspect-[3/4] rounded-card overflow-hidden bg-rose shadow-soft">
        <Image
          src={category.image_url ?? FALLBACK_IMAGE}
          alt=""
          fill
          sizes="(min-width: 1024px) 210px, 150px"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="font-display text-white text-lg leading-tight drop-shadow-sm">{category.name}</p>
          <p className="mt-1 inline-block rounded-full bg-white/90 text-ink text-[10px] font-semibold px-2 py-0.5">{n} {n === 1 ? "piece" : "pieces"}</p>
        </div>
      </div>
    </button>
  );
}
