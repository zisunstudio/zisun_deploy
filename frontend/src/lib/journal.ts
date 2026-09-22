import type { Product } from "@/lib/queries/catalog";

/**
 * The ZISUN Journal: what the label knows, written so a stranger searching
 * for it finds us without having heard of us. An article names the pieces it
 * may recommend; their price, stock and facts are read from the pieces
 * themselves at render time, never copied into the article's text.
 */
export type ArticleKind = "style" | "fabric" | "occasion" | "fit" | "care" | "founder" | "collection" | "explainer";

export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  kind: ArticleKind;
  cover_url: string | null;
  published_at: string | null;
}

export interface Article extends ArticleCard {
  body_md: string;
  meta_title: string | null;
  meta_description: string | null;
  search_intent: string | null;
  updated_at: string;
  products: Product[];
}

/** What each kind is called on the page. The reader sees a subject, not a tag. */
export const KIND_LABEL: Record<ArticleKind, string> = {
  style: "How to wear it",
  fabric: "Cloth",
  occasion: "For the occasion",
  fit: "Fit & size",
  care: "Care",
  founder: "From Sushmita",
  collection: "The collection",
  explainer: "Explained",
};
