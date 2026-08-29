import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SkinProvider } from "./SkinContext.tsx";
import { loadSkin } from "./skin.ts";

document.documentElement.dataset.skin = loadSkin();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SkinProvider>
      <App />
    </SkinProvider>
  </StrictMode>,
);
