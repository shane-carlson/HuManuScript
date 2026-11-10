import { useCallback, useState } from "react";
import { useSession } from "../session.tsx";
import { plusRefusal } from "./plan.ts";
import { PlusCard } from "./Plus.tsx";

/**
 * For a screen that sends a gated action. `refused(caught)` is true when the
 * server said the action is on the Plus side: the error toast is taken back
 * down and `card` holds the gentle card to show instead. A screen with more
 * than one gate says which it was with `refused(caught, feature)`.
 */
export function usePlusCard(feature: string) {
  const { clearError } = useSession();
  const [said, setSaid] = useState({ message: "", feature });
  const refused = useCallback((caught: unknown, which = feature) => {
    const message = plusRefusal(caught);
    if (!message) return false;
    clearError();
    setSaid({ message, feature: which });
    return true;
  }, [clearError, feature]);
  const clear = useCallback(() => setSaid((now) => (now.message ? { message: "", feature } : now)), [feature]);
  return { card: said.message ? <PlusCard feature={said.feature} message={said.message} /> : null, said: said.message, refused, clear };
}
