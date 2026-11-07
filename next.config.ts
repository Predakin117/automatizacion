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
  // El núcleo WASM que elige el worker depende de la CPU (relaxedsimd, simd o base, con o sin
  // lstm): se incluye TODO tesseract.js-core (excluir variantes dio "Cannot find module").
  outputFileTracingIncludes: {
    "/api/salud": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*"],
    "/api/procesos/**": [
      "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*",
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
      "./node_modules/whatwg-url/**/*",
      "./node_modules/tr46/**/*",
      "./node_modules/webidl-conversions/**/*",
    ],
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
