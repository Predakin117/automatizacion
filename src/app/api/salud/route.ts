import { existsSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";

/**
 * Diagnóstico del despliegue: convierte "no sé qué pasa en Vercel" en un JSON legible.
 * Solo devuelve booleanos y NOMBRES de variables; jamás valores.
 * (En la Fase A pasará a exigir sesión.)
 */

// Variables que la app necesita (las mismas de .env.example, salvo las opcionales).
const VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "USUARIOS_PERMITIDOS",
] as const;

// Los datos del idioma vienen del paquete npm (sin descargas de red). Si no entran
// al paquete de la función, tesseract intentaría bajarlos de internet.
const DATOS_SPA = path.join(
  process.cwd(),
  "node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
);

/** sharp es un binario nativo: comprobamos que carga y que de verdad procesa una imagen. */
async function sharpFunciona(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { default: sharp } = await import("sharp");
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    return { ok: png.length > 0 };
  } catch (e) {
    // Solo el mensaje: no contiene secretos (es un error de carga de módulo).
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  // Se ejecuta en cada petición (con cacheComponents no existe `dynamic`).
  await connection();

  const faltantes = VARIABLES.filter((n) => !process.env[n]?.trim());
  const sharp = await sharpFunciona();
  const datosTesseract = existsSync(DATOS_SPA);

  return Response.json({
    ok: faltantes.length === 0 && sharp.ok && datosTesseract,
    node: process.version,
    datosTesseract,
    sharp,
    variablesFaltantes: faltantes,
  });
}
