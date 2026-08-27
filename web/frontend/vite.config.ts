import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode !== "test"
      ? [
          viteStaticCopy({
            targets: [
              { src: "node_modules/cesium/Build/Cesium/Workers", dest: "cesium/Workers" },
              { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: "cesium/ThirdParty" },
              { src: "node_modules/cesium/Build/Cesium/Assets", dest: "cesium/Assets" },
              { src: "node_modules/cesium/Build/Cesium/Widgets", dest: "cesium/Widgets" },
            ],
          }),
        ]
      : []),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  server: {
    host: "127.0.0.1",
    port: 6473,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:6400",
        changeOrigin: true,
      },
    },
  },
}));
