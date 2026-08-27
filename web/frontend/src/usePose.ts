import { useEffect, useState } from "react";
import { getPose, type PoseResponse } from "./api";

export function usePose(slug: string | null, t: number) {
  const [pose, setPose] = useState<PoseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPose(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    getPose(slug, t)
      .then((data) => {
        if (!cancelled) setPose(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  return { pose, error };
}
