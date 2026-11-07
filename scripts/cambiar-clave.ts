/**
 * Cambia la contraseña de un usuario de Firebase Auth y cierra sus sesiones abiertas.
 *   npx tsx scripts/cambiar-clave.ts tu@correo.com
 * La contraseña se pide en la terminal SIN mostrarse (no queda en el historial de comandos
 * ni en ningún archivo). Después se revocan los tokens: las cookies de sesión existentes dejan
 * de valer (exigirUsuario verifica con checkRevoked = true) y hay que volver a iniciar sesión.
 */
import { getAuth } from "firebase-admin/auth";
import { appAdmin, cargarEntorno } from "./lib/entorno";

/** Lee una línea sin mostrar lo que se escribe (muestra * por cada carácter). */
function pedirOculto(pregunta: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      rechazar(new Error("Ejecuta el script en una terminal interactiva."));
      return;
    }
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8");
    let valor = "";
    const alTeclear = (tecla: string) => {
      for (const c of tecla) {
        if (c === "\r" || c === "\n") {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off("data", alTeclear);
          process.stdout.write("\n");
          resolver(valor);
          return;
        }
        if (c === "\u0003") {
          // Ctrl+C
          entrada.setRawMode(false);
          process.stdout.write("\n");
          process.exit(1);
        }
        if (c === "\u007f" || c === "\b") {
          if (valor.length > 0) {
            valor = valor.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          valor += c;
          process.stdout.write("*");
        }
      }
    };
    entrada.on("data", alTeclear);
  });
}

async function main(): Promise<void> {
  cargarEntorno();
  const correo = (process.argv[2] ?? process.env.CORREO ?? "").trim();
  if (!correo) {
    console.log("Uso: npx tsx scripts/cambiar-clave.ts tu@correo.com");
    process.exitCode = 1;
    return;
  }
  const auth = getAuth(appAdmin());
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(correo)).uid;
  } catch {
    console.log(`No existe un usuario con el correo ${correo}.`);
    process.exitCode = 1;
    return;
  }

  const clave = await pedirOculto("Nueva contraseña: ");
  const repetida = await pedirOculto("Repítela: ");
  if (clave !== repetida) {
    console.log("No coinciden. No se cambió nada.");
    process.exitCode = 1;
    return;
  }
  if (clave.length < 12) {
    console.log("Usa al menos 12 caracteres. No se cambió nada.");
    process.exitCode = 1;
    return;
  }

  await auth.updateUser(uid, { password: clave });
  // Cierra todas las sesiones abiertas con la contraseña anterior.
  await auth.revokeRefreshTokens(uid);
  console.log(`Contraseña cambiada para ${correo}. Las sesiones abiertas se cerraron: vuelve a iniciar sesión.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
