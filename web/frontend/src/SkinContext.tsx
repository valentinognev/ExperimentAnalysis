import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadSkin, saveSkin, type Skin } from "./skin";

type SkinContextValue = {
  skin: Skin;
  setSkin: (s: Skin) => void;
};

const SkinContext = createContext<SkinContextValue | null>(null);

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(() => loadSkin());

  const setSkin = useCallback((s: Skin) => {
    setSkinState(s);
    saveSkin(s);
    document.documentElement.dataset.skin = s;
  }, []);

  const value = useMemo(() => ({ skin, setSkin }), [skin, setSkin]);

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) {
    throw new Error("useSkin must be used within SkinProvider");
  }
  return ctx;
}
