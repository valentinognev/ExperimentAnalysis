import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesium";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode !== "test"
      ? [
          viteStaticCopy({
            targets: [
              {
                src: `${cesiumSource}/ThirdParty`,
                dest: cesiumBaseUrl,
                rename: { stripBase: 4 },
              },
              {
                src: `${cesiumSource}/Workers`,
                dest: cesiumBaseUrl,
                rename: { stripBase: 4 },
              },
              {
                src: `${cesiumSource}/Assets`,
                dest: cesiumBaseUrl,
                rename: { stripBase: 4 },
              },
              {
                src: `${cesiumSource}/Widgets`,
                dest: cesiumBaseUrl,
                rename: { stripBase: 4 },
              },
            ],
          }),
        ]
      : []),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
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
