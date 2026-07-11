import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves at username.github.io/Paisa/ (needs base "/Paisa/");
// Vercel serves at the domain root. Vercel sets VERCEL=1 during builds,
// so both hosts work with no manual configuration.
export default defineConfig({
  base: process.env.VERCEL ? "/" : "/Paisa/",
  plugins: [react()],
});
