/**
 * Fase 0: comprueba que este computador se conecta a los tres servicios.
 *   npx tsx scripts/probar-conexion.ts
 * Imprime "OK" o el error de cada uno. NUNCA imprime valores de variables.
 */
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import { appAdmin, cargarEntorno, requerir, variablesFaltantes } from "./lib/entorno";

const NECESARIAS = [
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

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function probarFirestore(): Promise<void> {
  // Escribe, lee y borra un documento temporal: prueba permisos de lectura y escritura.
  const ref = getFirestore(appAdmin()).collection("pruebas_conexion").doc(randomUUID());
  await ref.set({ creadoEn: new Date() });
  const leido = await ref.get();
  await ref.delete();
  if (!leido.exists) throw new Error("se escribió el documento pero no se pudo leer");
}

async function probarAuth(): Promise<string> {
  const { users } = await getAuth(appAdmin()).listUsers(1000);
  return `${users.length} usuario(s)`;
}

async function probarStorage(): Promise<string> {
  const supabase = createClient(requerir("SUPABASE_URL"), requerir("SUPABASE_SECRET_KEY"), {
    // Cliente de servidor: no hay sesión de usuario que guardar ni refrescar.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nombre = requerir("SUPABASE_BUCKET");

  const { data: bucket, error } = await supabase.storage.getBucket(nombre);
  if (error) throw new Error(`no se encontró el bucket "${nombre}": ${error.message}`);
  // Las facturas tienen datos de clientes: el bucket debe ser privado.
  if (bucket.public) throw new Error(`el bucket "${nombre}" es PÚBLICO; debe ser privado`);

  // Sube y borra un archivo diminuto: prueba que la clave tiene permiso de escritura.
  const ruta = `pruebas-conexion/${randomUUID()}.txt`;
  const subida = await supabase.storage
    .from(nombre)
    .upload(ruta, Buffer.from("prueba"), { contentType: "text/plain" });
  if (subida.error) throw new Error(`no se pudo subir un archivo: ${subida.error.message}`);
  const borrado = await supabase.storage.from(nombre).remove([ruta]);
  if (borrado.error) throw new Error(`no se pudo borrar el archivo de prueba: ${borrado.error.message}`);
  return `bucket "${nombre}" privado`;
}

async function main(): Promise<void> {
  cargarEntorno();
  const faltan = variablesFaltantes(NECESARIAS);
  if (faltan.length > 0) {
    console.log(`Faltan variables en .env: ${faltan.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const pruebas: [string, () => Promise<string | void>][] = [
    ["Firestore", probarFirestore],
    ["Auth", probarAuth],
    ["Storage", probarStorage],
  ];
  for (const [servicio, probar] of pruebas) {
    try {
      const detalle = await probar();
      console.log(`${servicio} OK${detalle ? ` (${detalle})` : ""}`);
    } catch (e) {
      console.log(`${servicio} ERROR: ${mensaje(e)}`);
      process.exitCode = 1;
    }
  }
}

main();
