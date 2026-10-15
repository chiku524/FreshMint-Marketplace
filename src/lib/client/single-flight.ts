"use client";

import { useState } from "react";

export type SingleFlight = <T>(fn: () => Promise<T>) => Promise<T | undefined>;

/**
 * Drops calls while a previous one is still running. React state-based
 * `disabled` flags only apply after a re-render, so a fast double click can
 * still fire two purchases/bids; this guard is synchronous.
 */
export function createSingleFlight(): SingleFlight {
  let running = false;
  return async (fn) => {
    if (running) return undefined;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}

/** Stable per-component single-flight guard. */
export function useSingleFlight(): SingleFlight {
  const [guard] = useState(createSingleFlight);
  return guard;
}

/** True for fetch aborts triggered by unmount / superseded requests. */
export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException
    ? e.name === "AbortError"
    : (e as { name?: string } | null)?.name === "AbortError";
}
