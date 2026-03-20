import { useState, useRef, useEffect, useCallback } from 'react';

const FRAME_MS = 16; // ~60fps

/**
 * Decouples scroll input from React renders.
 *
 * Keypresses update a ref instantly (zero-cost). A timer flushes the ref
 * to React state at most once per FRAME_MS. When Ink can't keep up with
 * the keyboard repeat rate, multiple scroll steps collapse into a single
 * render — identical to how native terminal apps stay smooth.
 */
export function useThrottledScroll(initial = 0): {
  offset: number;
  scrollBy: (delta: number) => void;
  scrollTo: (value: number) => void;
  reset: () => void;
} {
  const [offset, setOffset] = useState(initial);
  const targetRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    setOffset(targetRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current === null) {
      timerRef.current = setTimeout(flush, FRAME_MS);
    }
  }, [flush]);

  const scrollBy = useCallback(
    (delta: number) => {
      targetRef.current = Math.max(0, targetRef.current + delta);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const scrollTo = useCallback(
    (value: number) => {
      targetRef.current = Math.max(0, value);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const reset = useCallback(() => {
    targetRef.current = initial;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOffset(initial);
  }, [initial]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return { offset, scrollBy, scrollTo, reset };
}
