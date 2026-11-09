import { useEffect, useState } from "react";

/** The current time, refreshed on a timer so anything worked out from the clock stays true while a screen sits open. */
export function useNow(everyMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
