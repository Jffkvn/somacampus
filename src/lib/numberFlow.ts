import { useEffect, useRef, useState } from 'react';

/** P1 — institutional number motion (Number Flow–style count-up, no deps). */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smoothly interpolates a numeric target. Respects prefers-reduced-motion.
 */
export function useCountUp(target: number, durationMs = 450): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion()) {
      prevRef.current = target;
      setDisplay(target);
      return;
    }
    const from = prevRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
        setDisplay(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

/**
 * Parses StatCard-style values: 12800000 | "12800000" | "UGX 12,800,000" | "10.3%".
 * Returns numeric magnitude + format helper; non-numeric strings pass through.
 */
export function parseStatValue(value: string | number): {
  numeric: number | null;
  format: (n: number) => string;
  raw: string;
} {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'number') {
    return {
      numeric: value,
      format: (n) => Math.round(n).toLocaleString('en-US'),
      raw,
    };
  }
  const pct = raw.match(/^([\d.,]+)\s*%$/);
  if (pct) {
    const n = parseFloat(pct[1].replace(/,/g, ''));
    if (Number.isFinite(n)) {
      return {
        numeric: n,
        format: (x) => `${x.toFixed(1).replace(/\.0$/, '')}%`,
        raw,
      };
    }
  }
  const money = raw.match(/^(.*?)([\d][\d,]*(?:\.\d+)?)\s*$/);
  if (money) {
    const prefix = money[1];
    const n = parseFloat(money[2].replace(/,/g, ''));
    if (Number.isFinite(n)) {
      return {
        numeric: n,
        format: (x) =>
          `${prefix}${Math.round(x).toLocaleString('en-US')}`,
        raw,
      };
    }
  }
  return { numeric: null, format: () => raw, raw };
}
