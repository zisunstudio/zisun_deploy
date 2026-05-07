"use client";

import { useState } from "react";
import { ShoppingBag, Search, User, Truck, ShieldCheck, RefreshCcw } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import CartDrawer from "@/components/CartDrawer";
import { useCartStore } from "@/store/useCartStore";

export default function Home() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const cartItemsCount = useCartStore((state) => state.items.length);
  return (
    <div className="h-full w-full flex flex-col">
      {/* Top Navigation Overlay */}
      <header className="absolute top-0 w-full p-4 z-10 flex justify-between items-center text-white mix-blend-difference">
        <h1 className="text-xl font-bold tracking-widest uppercase">Zisun</h1>
        <div className="flex gap-4">
          <Search className="w-6 h-6 cursor-pointer" />
          <User className="w-6 h-6 cursor-pointer" />
        </div>
      </header>

      {/* Main Feed Area - Placeholder for Infinite Scroll Videos/Images */}
      <div className="flex-1 bg-zinc-900 flex items-center justify-center relative">
        {/* Mock Content Card */}
        <div className="absolute inset-0">
          <div className="w-full h-full bg-gradient-to-b from-transparent via-transparent to-black/80 absolute inset-0 z-0" />
          <img 
            src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop" 
            alt="Fashion Model"
            className="w-full h-full object-cover object-[50%_25%] opacity-90"
          />
        </div>

        {/* Floating Product Tag (Bottom Sheet Trigger) */}
        <div className="absolute bottom-[130px] left-4 z-10">
          <h2 className="text-white text-2xl font-bold mb-1">Summer Collection '24</h2>
          <p className="text-gray-300 text-sm mb-4">Elevate your everyday aesthetic.</p>
          
          <button 
            onClick={() => setIsSheetOpen(true)}
            className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-white/20 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="font-medium text-sm">Shop the Look</span>
          </button>
        </div>
      </div>

      {/* Trust Badge Bar */}
      <div className="absolute bottom-[64px] w-full bg-primary text-white h-12 flex items-center justify-center gap-6 px-4 z-20 shadow-lg">
        <div className="flex items-center gap-1.5">
          <Truck className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs font-normal">Free Shipping</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCcw className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs font-normal">30-Day Returns</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span className="text-xs font-normal">Secure Pay</span>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="h-16 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 flex items-center justify-around px-6 absolute bottom-0 w-full z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <div className="text-primary flex flex-col items-center gap-1 cursor-pointer">
          <div className="w-6 h-6 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary" />
          </div>
          <span className="text-[10px] font-semibold">Feed</span>
          <span className="h-[3px] w-5 bg-primary rounded-t-sm absolute bottom-0" />
        </div>
        <div 
          onClick={toggleCart}
          className="text-gray-500 dark:text-gray-400 flex flex-col items-center gap-1 cursor-pointer hover:text-primary transition-colors relative"
        >
          <div className="relative w-6 h-6 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
            {cartItemsCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-black">
                {cartItemsCount}
              </div>
            )}
          </div>
          <span className="text-[10px] font-medium">Cart</span>
        </div>
      </nav>

      {/* Overlays */}
      <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
      <CartDrawer />
    </div>
  );
}
