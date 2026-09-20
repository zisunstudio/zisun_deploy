"use client";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Sections arrive as the page is scrolled: a short rise and a fade, once.
 *
 * It is a small amount of motion and it is spent on the one thing motion is
 * good for on a shop - making a long page feel like it is being turned rather
 * than dumped. Respects reduced-motion, in which case it renders in place.
 */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
