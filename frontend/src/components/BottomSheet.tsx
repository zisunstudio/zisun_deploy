"use client";

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
      size: "M"
    });
    onClose();
    toggleCart(); // Open cart to show user it was added
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 z-40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 w-full bg-zinc-900 rounded-t-3xl z-50 overflow-hidden"
          >
            {/* Drag Handle Area */}
            <div className="w-full pt-4 pb-2 flex justify-center items-center relative">
              <div className="w-12 h-1.5 bg-zinc-700 rounded-full" />
              <button onClick={onClose} className="absolute right-4 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Details */}
            <div className="p-6 pt-2">
              <div className="flex gap-4 mb-6">
                <img 
                  src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=200" 
                  alt="Product Thumbnail"
                  className="w-24 h-32 object-cover rounded-lg"
                />
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-1">Silk Resort Shirt</h3>
                  <p className="text-accent text-lg font-medium mb-3">₹2,499</p>
                  <p className="text-zinc-400 text-sm line-clamp-2">
                    Premium silk blend resort shirt perfect for your summer getaway. Relaxed fit.
                  </p>
                </div>
              </div>

              {/* Add to Cart Button */}
              <button 
                onClick={handleAddToCart}
                className="w-full bg-white text-black py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors"
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
