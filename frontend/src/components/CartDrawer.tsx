"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, ArrowRight } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";

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
            className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />

          {/* Drawer (Slides from Right) */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 bottom-0 w-4/5 max-w-[320px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-white font-semibold text-lg">Your Cart ({items.length})</h2>
              <button onClick={toggleCart} className="p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-800/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 no-scrollbar">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                  <div className="w-16 h-16 rounded-full border border-dashed border-zinc-700 flex items-center justify-center">
                    <span className="text-2xl">🛍️</span>
                  </div>
                  <p>Your cart is empty.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex gap-4 bg-zinc-800/30 p-3 rounded-xl border border-zinc-800/50">
                    <img src={item.image} alt={item.name} className="w-20 h-24 object-cover rounded-md" />
                    <div className="flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="text-white text-sm font-medium line-clamp-1">{item.name}</h4>
                          <button onClick={() => removeItem(item.id)} className="text-zinc-500 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-zinc-400 text-xs mt-1">Size: {item.size}</p>
                      </div>
                      <div className="flex justify-between items-end">
                        <p className="text-accent font-medium text-sm">₹{item.price}</p>
                        <div className="flex items-center gap-3 bg-zinc-950 rounded-full px-2 py-1">
                          <button 
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            className="text-zinc-400 hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-white text-xs font-medium w-4 text-center">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="text-zinc-400 hover:text-white"
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

            {/* Footer / Checkout */}
            {items.length > 0 && (
              <div className="p-4 bg-zinc-900 border-t border-zinc-800">
                <div className="flex justify-between text-zinc-400 text-sm mb-4">
                  <span>Subtotal</span>
                  <span className="text-white font-medium">₹{getCartTotal()}</span>
                </div>
                <button className="w-full bg-white text-black py-4 rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors">
                  Checkout
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
