import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "client", "src", "assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Chunks de fornecedores (23/09): o `index-*.js` carregava React,
        // TanStack, Radix, lucide, date-fns e zod junto com o código do app —
        // qualquer deploy invalidava o cache de tudo. Separados, o navegador
        // reaproveita os vendors entre versões e o chunk do app fica menor.
        manualChunks(id: string) {
          const p = id.replace(/\\/g, "/");
          if (!p.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler|wouter)\//.test(p)) return "vendor-react";
          if (p.includes("/node_modules/@tanstack/")) return "vendor-query";
          if (p.includes("/node_modules/@radix-ui/") || p.includes("/node_modules/cmdk/") || p.includes("/node_modules/lucide-react/")) return "vendor-ui";
          if (p.includes("/node_modules/date-fns/") || p.includes("/node_modules/zod/")) return "vendor-utils";
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
