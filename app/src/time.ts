import { useEffect, useState } from "react";

export const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;

/** performance.now(), refreshed four times a second while `live` is true. */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}
