"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Search, User, Truck, RefreshCcw,
  ShieldCheck, Star, Home, Grid3X3, Heart, ChevronRight,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import CartDrawer from "@/components/CartDrawer";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryCardSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useCategories, useFeed } from "@/lib/queries/catalog";
import { FeedCard } from "@/components/FeedCard";
import { trackEvent } from "@/lib/queries/analytics";

const TRUST_BADGES = [
  { Icon: Truck, title: "Free Shipping", subtitle: "On orders above ₹999" },
  { Icon: RefreshCcw, title: "Easy Returns", subtitle: "7-day return policy" },
  { Icon: ShieldCheck, title: "Secure Payments", subtitle: "100% secure checkout" },
  { Icon: Star, title: "Trusted by", subtitle: "10K+ customers" },
];

const HERO_IMAGE = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop";

export default function HomePage() {
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("home");
  const [activeDot, setActiveDot] = useState(0);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const { data: categories, isLoading: loadingCategories } = useCategories();
  const { data: feedData } = useFeed(1);
  const heroRef = useRef<HTMLDivElement>(null);

  // Track hero feed item view
  useEffect(() => {
    const firstItem = feedData?.items?.[0];
    if (!firstItem) return;
    trackEvent("content_viewed", { item_id: firstItem.id });
  }, [feedData]);

  const NAV_ITEMS = [
    { Icon: Home, label: "Home", id: "home", href: "/" },
    { Icon: Grid3X3, label: "Shop", id: "shop", href: "/shop" },
    { Icon: Heart, label: "Wishlist", id: "wishlist", href: "/wishlist" },
    { Icon: ShoppingBag, label: "Cart", id: "cart", href: null },
    { Icon: User, label: "Profile", id: "profile", href: "/profile" },
  ];

  function handleNavClick(id: string, href: string | null) {
    if (id === "cart") {
      toggleCart();
    } else {
      setActiveNav(id);
      if (href) router.push(href);
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto no-scrollbar relative">

        {/* Header — absolute over hero */}
        <header className="absolute top-0 w-full px-5 pt-5 z-10 flex justify-between items-start">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1A0F0A] leading-none tracking-wide">
              ZISUN
            </h1>
            <p className="text-primary text-[9px] font-semibold tracking-[0.22em] uppercase mt-0.5">
              Wear Your Story.
            </p>
          </div>
          <div className="flex gap-2 mt-0.5">
            <button
              onClick={() => router.push("/search")}
              className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/70"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-foreground" />
            </button>
            <button
              onClick={() => router.push("/profile")}
              className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/70"
              aria-label="Profile"
            >
              <User className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </header>

        {/* Hero */}
        <div ref={heroRef} className="relative h-[72vh]">
          {feedData?.items?.[0] ? (
            <div className="absolute inset-0">
              <FeedCard item={feedData.items[0] as any} />
            </div>
          ) : (
            <>
              <Image
                src={HERO_IMAGE}
                alt="Summer Collection '24"
                fill
                priority
                sizes="100vw"
                className="object-cover object-[50%_20%]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />

              <div className="absolute bottom-10 left-5 z-10">
                <h2 className="font-serif text-[2.6rem] font-bold text-white leading-tight mb-1 drop-shadow-sm">
                  Summer<br />Collection &#39;24
                </h2>
                <p className="text-white/80 text-sm mb-5">Elevate your everyday aesthetic.</p>
                <button
                  onClick={() => setIsSheetOpen(true)}
                  className="bg-[#5C3317] text-white px-7 py-3.5 rounded-full inline-flex items-center gap-2 font-semibold text-sm hover:bg-[#4A2810] transition-colors shadow-lg"
                >
                  Shop the Look
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                {[0, 1, 2, 3].map((i) => (
                  <button
                    key={i}
                    onClick={() => setActiveDot(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      activeDot === i ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Trust badges */}
        <div className="mx-4 -mt-5 relative z-10 bg-white rounded-2xl shadow-md px-3 py-4 grid grid-cols-4 gap-1">
          {TRUST_BADGES.map(({ Icon, title, subtitle }) => (
            <div key={title} className="flex flex-col items-center text-center gap-1">
              <div className="w-8 h-8 rounded-full bg-[#F7F0E8] flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} />
              </div>
              <span className="text-foreground text-[10px] font-semibold leading-tight">{title}</span>
              <span className="text-muted text-[8.5px] leading-tight">{subtitle}</span>
            </div>
          ))}
        </div>

        {/* Shop by Category — real data */}
        <div className="mt-6 px-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-serif text-xl font-bold text-foreground">Shop by Category</h3>
            <button
              onClick={() => router.push("/shop")}
              className="text-primary text-sm font-medium flex items-center gap-0.5 hover:underline"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {loadingCategories
              ? Array(4).fill(0).map((_, i) => <CategoryCardSkeleton key={i} />)
              : categories?.map((cat) => <CategoryCard key={cat.id} category={cat} />)
            }
          </div>
        </div>

        <div className="h-20" />
      </div>

      {/* Bottom nav */}
      <nav className="h-16 bg-white border-t border-gray-100 flex items-center justify-around px-1 flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {NAV_ITEMS.map(({ Icon, label, id, href }) => {
          const isCart = id === "cart";
          const isActive = activeNav === id && !isCart;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id, href)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 relative transition-colors ${
                isActive ? "text-primary" : "text-gray-400"
              }`}
            >
              <div className="relative">
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                {isCart && cartItemsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2.5px] bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
      <CartDrawer />
    </div>
  );
}
