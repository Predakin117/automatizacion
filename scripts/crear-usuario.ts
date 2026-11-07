/**
 * Crea un usuario de Firebase Auth (correo y contraseña) sin dejar la contraseña en ningún archivo.
 *   PowerShell:  $env:CORREO="tu@correo.com"; $env:CLAVE="..."; npx tsx scripts/crear-usuario.ts
 *   Bash:        CORREO=tu@correo.com CLAVE=... npx tsx scripts/crear-usuario.ts
 * Recuerda añadir el correo a USUARIOS_PERMITIDOS (Fase A).
 */
import { getAuth } from "firebase-admin/auth";
import { appAdmin, cargarEntorno } from "./lib/entorno";

async function main(): Promise<void> {
  cargarEntorno();
  const correo = process.env.CORREO?.trim();
  const clave = process.env.CLAVE;
  if (!correo || !clave) {
    console.log("Define las variables CORREO y CLAVE al ejecutar el script (ver el comentario de arriba).");
    process.exitCode = 1;
    return;
  }
  if (clave.length < 8) {
    console.log("La contraseña debe tener al menos 8 caracteres.");
    process.exitCode = 1;
    return;
  }
  try {
    const usuario = await getAuth(appAdmin()).createUser({ email: correo, password: clave });
    console.log(`Usuario creado: ${usuario.email} (uid ${usuario.uid})`);
  } catch (e) {
    console.log(`No se pudo crear el usuario: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

main();
