"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BottomSheet({ isOpen, onClose }: BottomSheetProps) {
  const addItem = useCartStore((state) => state.addItem);
  const toggleCart = useCartStore((state) => state.toggleCart);

  const handleAddToCart = () => {
    addItem({
      id: "variant_123",
      name: "Silk Resort Shirt",
      price: 2499,
      quantity: 1,
      image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=200",
      size: "M",
    });
    onClose();
    toggleCart();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="absolute bottom-0 w-full bg-white rounded-t-3xl z-50 overflow-hidden shadow-2xl"
          >
            {/* Drag handle */}
            <div className="w-full pt-4 pb-2 flex justify-center items-center relative">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
              <button
                onClick={onClose}
                className="absolute right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pb-8 pt-2">
              {/* Product info */}
              <div className="flex gap-4 mb-6">
                <div className="relative w-24 h-32 rounded-xl overflow-hidden flex-shrink-0">
                  <Image
                    src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=200"
                    alt="Silk Resort Shirt"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 py-1">
                  <h3 className="font-serif text-xl font-bold text-foreground mb-1">
                    Silk Resort Shirt
                  </h3>
                  <p className="text-primary text-lg font-semibold mb-2">₹2,499</p>
                  <p className="text-muted text-sm leading-relaxed line-clamp-2">
                    Premium silk blend resort shirt perfect for your summer getaway. Relaxed fit.
                  </p>
                </div>
              </div>

              {/* Size selector placeholder */}
              <div className="flex gap-2 mb-5">
                {["XS", "S", "M", "L", "XL"].map((s) => (
                  <button
                    key={s}
                    className={`w-10 h-10 rounded-full border text-xs font-medium transition-colors ${
                      s === "M"
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 text-gray-500 hover:border-primary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4A2810] transition-colors shadow-md"
              >
                <ShoppingBag className="w-5 h-5" />
                Add to Cart
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
