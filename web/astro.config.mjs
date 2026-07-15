// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static export, same shape as the worldfall reader.
export default defineConfig({
  site: "https://philipweiss.net",
  output: "static",
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
