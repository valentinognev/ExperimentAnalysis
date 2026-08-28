import type { PoseResponse } from "./api";

export type PoseQueryHandle = {
  setTarget: (slug: string | null, t: number, refreshToken?: number) => void;
  dispose: () => void;
};

type Target = {
  slug: string | null;
  t: number;
  refreshToken: number;
};

export function createPoseQuery(opts: {
  getPose: (slug: string, t: number) => Promise<PoseResponse>;
  onPose: (pose: PoseResponse | null) => void;
  onError: (message: string | null) => void;
}): PoseQueryHandle {
  let disposed = false;
  let inFlight = false;
  let target: Target = { slug: null, t: 0, refreshToken: 0 };
  let fetchedKey: string | null = null;

  function keyOf(s: string, t: number, refreshToken: number): string {
    return `${s}|${t}|${refreshToken}`;
  }

  async function loop() {
    if (disposed || inFlight) return;
    const startSlug = target.slug;
    if (startSlug === null) {
      fetchedKey = null;
      opts.onPose(null);
      opts.onError(null);
      return;
    }

    inFlight = true;
    try {
      while (!disposed) {
        const { slug, t, refreshToken } = target;
        if (slug === null) {
          fetchedKey = null;
          opts.onPose(null);
          opts.onError(null);
          break;
        }
        try {
          const data = await opts.getPose(slug, t);
          if (disposed) return;
          if (target.slug !== slug) continue;
          fetchedKey = keyOf(slug, t, refreshToken);
          opts.onPose(data);
          opts.onError(null);
        } catch (e: unknown) {
          if (disposed) return;
          if (target.slug !== slug) continue;
          opts.onError(e instanceof Error ? e.message : String(e));
          break;
        }
        if (
          target.slug === slug &&
          target.t === t &&
          target.refreshToken === refreshToken
        ) {
          break;
        }
      }
    } finally {
      inFlight = false;
    }

    if (disposed) return;
    const currentKey =
      target.slug === null
        ? null
        : keyOf(target.slug, target.t, target.refreshToken);
    if (currentKey !== fetchedKey) void loop();
  }

  return {
    setTarget(slug, t, refreshToken = 0) {
      target = { slug, t, refreshToken };
      void loop();
    },
    dispose() {
      disposed = true;
    },
  };
}
