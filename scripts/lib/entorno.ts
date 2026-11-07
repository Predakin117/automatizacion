import { existsSync } from "node:fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

/**
 * Carga `.env` para los scripts de línea de comandos (Next.js lo hace solo en la app,
 * pero `tsx` no). Usa el cargador nativo de Node 24: sin dependencias extra.
 */
export function cargarEntorno(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

/** Nombres de las variables que faltan. Nunca devuelve ni imprime valores. */
export function variablesFaltantes(nombres: readonly string[]): string[] {
  return nombres.filter((n) => !process.env[n]?.trim());
}

/** Lee una variable obligatoria; si falta, el error menciona solo su nombre. */
export function requerir(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable ${nombre} en .env`);
  return valor;
}

/** Inicializa firebase-admin una sola vez con la cuenta de servicio. */
export function appAdmin(): App {
  const existente = getApps()[0];
  if (existente) return existente;
  return initializeApp({
    credential: cert({
      projectId: requerir("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requerir("FIREBASE_ADMIN_CLIENT_EMAIL"),
      // En Vercel la clave llega con "\n" literales; en .env pueden llegar ya convertidos.
      // Reemplazar cubre los dos casos.
      privateKey: requerir("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}
