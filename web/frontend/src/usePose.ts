import { useEffect, useRef, useState } from "react";
import { getPose, type PoseResponse } from "./api";
import { createPoseQuery, type PoseQueryHandle } from "./poseQuery";

export function usePose(slug: string | null, t: number, refreshToken = 0) {
  const [pose, setPose] = useState<PoseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qRef = useRef<PoseQueryHandle | null>(null);

  useEffect(() => {
    const q = createPoseQuery({
      getPose,
      onPose: setPose,
      onError: setError,
    });
    qRef.current = q;
    return () => {
      q.dispose();
      qRef.current = null;
    };
  }, []);

  useEffect(() => {
    qRef.current?.setTarget(slug, t, refreshToken);
  }, [slug, t, refreshToken]);

  return { pose, error };
}
