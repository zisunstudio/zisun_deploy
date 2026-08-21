"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, ArrowRight } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { BrowseOnlyCTA } from "@/components/BrowseOnlyCTA";

export default function CartDrawer() {
  const { items, isOpen, toggleCart, updateQuantity, removeItem, getCartTotal } = useCartStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleCart}
            className="absolute inset-0 bg-black/50 z-40 backdrop-blur-sm"
          />

          {/* Drawer — slides from right */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="absolute right-0 top-0 bottom-0 w-4/5 max-w-[320px] bg-white border-l border-gray-100 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-serif text-lg font-bold text-foreground">
                Your Cart ({items.length})
              </h2>
              <button
                onClick={toggleCart}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 no-scrollbar">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
                  <div className="w-16 h-16 rounded-full border border-dashed border-gray-300 flex items-center justify-center">
                    <span className="text-2xl">🛍️</span>
                  </div>
                  <p className="text-sm">Your cart is empty.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-3 bg-[#F7F0E8] p-3 rounded-2xl border border-[#EDE4D8]"
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-18 h-22 w-[72px] h-[90px] object-cover rounded-xl flex-shrink-0"
                    />
                    <div className="flex flex-col justify-between flex-1 min-w-0">
                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <h4 className="text-foreground text-sm font-semibold line-clamp-1">
                            {item.name}
                          </h4>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-gray-300 hover:text-red-400 flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {item.size && (
                          <p className="text-muted text-xs mt-0.5">Size: {item.size}</p>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-primary font-semibold text-sm">₹{item.price.toLocaleString("en-IN")}</p>
                        <div className="flex items-center gap-2 bg-white rounded-full px-2.5 py-1 border border-gray-200">
                          <button
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="text-gray-400 hover:text-foreground"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-foreground text-xs font-semibold w-3 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="text-gray-400 hover:text-foreground"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-5 py-4 bg-white border-t border-gray-100">
                <div className="flex justify-between text-sm mb-4">
                  <span className="text-muted">Subtotal</span>
                  <span className="text-foreground font-bold">
                    ₹{getCartTotal().toLocaleString("en-IN")}
                  </span>
                </div>
                {BROWSE_ONLY ? (
                  <BrowseOnlyCTA />
                ) : (
                  <button className="w-full bg-[#5C3317] text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4A2810] transition-colors shadow-md">
                    Checkout
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
