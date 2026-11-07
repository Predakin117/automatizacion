import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Con cacheComponents no existen `dynamic`, `revalidate` ni `fetchCache`:
  // una ruta es dinámica si lee la petición o si llama `await connection()`.
  cacheComponents: true,
  partialPrefetching: true,
  // tesseract.js usa hilos (worker_threads) y WASM: si el empaquetador lo mete en el
  // bundle se rompe. Así se carga con `require` nativo de Node. (firebase-admin y
  // sharp ya vienen excluidos por defecto en Next 16.)
  serverExternalPackages: ["tesseract.js"],
  // tesseract carga su núcleo WASM y los datos del idioma con rutas calculadas en
  // tiempo de ejecución; el trazador de Next no los ve y no entrarían a la función
  // de Vercel. Las claves son rutas de la app; los valores, globs desde la raíz.
  // Se completa en la Fase 5 (OCR) con las rutas /api/procesos/**.
  outputFileTracingIncludes: {
    "/api/salud": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
