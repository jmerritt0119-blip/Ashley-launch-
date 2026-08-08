import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const PREFIX = "phx_draft_";

/**
 * useState that survives leaving the page.
 *
 * Half-finished work is still work. She may be three paragraphs into
 * describing the worst night of her life when she has to switch views, close
 * the laptop, or hit Quick Exit because he walked in. None of those may throw
 * away what she typed. Every keystroke is mirrored to this device (and only
 * this device), and restored the next time the form opens.
 *
 * Clearing is automatic: when a save handler resets the fields to their
 * starting values, the stored draft matches the initial value again and is
 * deleted. Existing forms therefore need no changes beyond swapping useState
 * for useDraft.
 */
export function useDraft<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const storageKey = PREFIX + key;
  const initialRef = useRef(initial);
  const baseline = useRef(JSON.stringify(initial));

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // Merge over the starting shape so a field added in a later version of
      // the app still exists on a draft saved by an older one.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && initial && typeof initial === "object") {
        return { ...(initial as object), ...(parsed as object) } as T;
      }
      return parsed as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      const json = JSON.stringify(value);
      if (json === baseline.current) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, json);
    } catch {
      // Private browsing or a full quota. The form still works in memory —
      // losing the safety net must never break the thing it protects.
    }
  }, [storageKey, value]);

  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* see above */
    }
    setValue(initialRef.current);
  };

  return [value, setValue, clear];
}

/** True when any form on this device has unsaved text waiting to be finished. */
export function hasDrafts(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
