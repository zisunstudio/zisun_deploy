"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Category } from "@/lib/queries/catalog";

const FALLBACK_IMAGE = "/placeholder-product.svg";

/**
 * A category as an occasion.
 *
 * The name is set into the photograph and the founder's one-line description
 * under it does the work ("the commute, the errand, the long lunch") - that
 * line is what turns a garment category into a way of dressing for a day.
 * No item count: "12 items" is a stock report, and this is not a stock room.
 */
/**
 * Launch-time category art was licensed stock: a different woman, in clothes
 * ZISUN does not sell, one section below "photographed on me". Once a
 * category has a real piece in it, its tile shows that piece - on Sushmita -
 * and the stock image is only the fallback for a category with nothing in
 * it yet. Photographs of her are the brand's proof; nothing else should
 * stand in for them.
 */
const LAUNCH_STOCK = /\/launch\//;

export function CategoryCard({ category, pieceImage }: { category: Category; pieceImage?: string | null }) {
  const router = useRouter();
  const stock = !category.image_url || LAUNCH_STOCK.test(category.image_url);
  const src = (stock && pieceImage) || category.image_url || pieceImage || FALLBACK_IMAGE;
  return (
    <button
      type="button"
      className="flex-shrink-0 w-[236px] lg:w-auto text-left group"
      onClick={() => router.push(`/category/${category.slug}`)}
      aria-label={category.name}
    >
      <div className="relative w-full aspect-[3/4] rounded-card overflow-hidden bg-rose">
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, 236px"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5">
          <p className="font-display text-white text-[26px] lg:text-[30px] leading-none">{category.name}</p>
          {category.description && (
            <p className="text-white/80 text-[12px] lg:text-[13px] mt-1.5 leading-snug line-clamp-2">{category.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}
