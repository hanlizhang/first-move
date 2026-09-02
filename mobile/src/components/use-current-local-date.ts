import { useEffect, useState } from "react";

import { localDateKey } from "../domain/dates.ts";

export function useCurrentLocalDate(): string {
  const [dateKey, setDateKey] = useState(localDateKey);

  useEffect(() => {
    const interval = setInterval(() => {
      setDateKey((current) => {
        const next = localDateKey();
        return next === current ? current : next;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return dateKey;
}
