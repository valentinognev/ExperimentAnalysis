type PointerHandler = {
  removeInputAction: (type: unknown) => void;
};

type CesiumViewerLike = {
  isDestroyed?: () => boolean;
  destroy: () => void;
  useDefaultRenderLoop?: boolean;
  scene?: {
    canvas: {
      removeEventListener: (type: string, listener: EventListener) => void;
    };
  };
};

export function isCesiumViewerAlive(
  viewer: CesiumViewerLike | null | undefined,
): viewer is CesiumViewerLike {
  if (!viewer) return false;
  try {
    if (typeof viewer.isDestroyed === "function" && viewer.isDestroyed()) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

export function destroyCesiumViewer(viewer: CesiumViewerLike | null): void {
  if (!isCesiumViewerAlive(viewer)) return;
  try {
    viewer.useDefaultRenderLoop = false;
    viewer.destroy();
  } catch {
    // container already detached
  }
}

export function unbindCesiumPointerEvents(
  viewer: CesiumViewerLike | null,
  handler: PointerHandler | null,
  leftDouble: unknown,
  rightClick: unknown,
  preventMenu: EventListener,
): void {
  if (!isCesiumViewerAlive(viewer) || !handler) return;
  try {
    handler.removeInputAction(leftDouble);
    handler.removeInputAction(rightClick);
    viewer.scene?.canvas.removeEventListener("contextmenu", preventMenu);
  } catch {
    // viewer destroyed while this cleanup ran
  }
}
