"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { RankedActivity } from "@/lib/activity/types";

/**
 * Favourites stored locally in the browser (no account, no server).
 * A snapshot of the card is kept: information may become outdated, the UI says so.
 */
const KEY = "sortir-autour:favorites:v1";
const EVENT = "sortir-autour:favorites";
const MAX = 100;

export interface FavoriteEntry {
  activity: RankedActivity;
  savedAt: string;
}

function parse(raw: string): FavoriteEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FavoriteEntry[]).filter((f) => f?.activity?.id && f.activity.name) : [];
  } catch {
    return [];
  }
}

function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function write(list: FavoriteEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full or unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useFavorites() {
  // null on the server / before hydration.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const list = useMemo(() => (raw === null ? [] : parse(raw)), [raw]);

  const isFavorite = useCallback((id: string) => list.some((f) => f.activity.id === id), [list]);

  const toggle = useCallback((a: RankedActivity) => {
    const current = parse(readRaw());
    const exists = current.some((f) => f.activity.id === a.id);
    write(exists ? current.filter((f) => f.activity.id !== a.id) : [{ activity: a, savedAt: new Date().toISOString() }, ...current]);
  }, []);

  const clear = useCallback(() => write([]), []);

  return { list, loaded: raw !== null, isFavorite, toggle, clear };
}
