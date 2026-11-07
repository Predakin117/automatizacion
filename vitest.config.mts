import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest no lee los alias de tsconfig.json: se declara el mismo "@/" → src/.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
