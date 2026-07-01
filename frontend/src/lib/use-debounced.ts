import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search box) so effects that fetch off it
 * don't fire on every keystroke. Returns the value after it's been stable for `ms`.
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
