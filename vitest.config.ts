import { defineConfig } from "vitest/config";
import path from "path";

// Config própria do vitest: o vite.config.ts tem root=client e esconderia os
// testes de shared/. Testes são co-locados (*.test.ts ao lado do código).
export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "client/src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
});
