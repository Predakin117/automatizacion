import { auth } from "@/lib/firebase/admin";

/**
 * Sesión del servidor.
 * - Autenticación (¿quién eres?): Firebase Auth verifica la contraseña y firma los tokens.
 * - Autorización (¿puedes usar esta app?): USUARIOS_PERMITIDOS. Hace falta porque la apiKey
 *   de Firebase es pública y el registro está abierto: cualquiera podría crear una cuenta
 *   y obtener un token válido. Sin la variable, nadie entra (falla cerrado).
 */

export const NOMBRE_COOKIE = "sesion";
export const DURACION_SESION_MS = 5 * 24 * 60 * 60 * 1000; // 5 días

export interface Usuario {
  uid: string;
  email: string;
}

/** Correos autorizados; tolera comillas y espacios alrededor de cada uno. */
export function correosPermitidos(): Set<string> {
  const crudo = process.env.USUARIOS_PERMITIDOS ?? "";
  return new Set(
    crudo
      .split(",")
      .map((c) => c.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

export function correoPermitido(email: string | undefined): email is string {
  return !!email && correosPermitidos().has(email.toLowerCase());
}

function leerCookie(request: Request, nombre: string): string | null {
  const cabecera = request.headers.get("cookie");
  if (!cabecera) return null;
  for (const parte of cabecera.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      return decodeURIComponent(parte.slice(i + 1).trim());
    }
  }
  return null;
}

function noAutorizado(mensaje: string, estado = 401): Response {
  return Response.json({ error: mensaje }, { status: estado });
}

/**
 * Se usa al inicio de TODAS las rutas de API:
 *   const u = await exigirUsuario(request); if (u instanceof Response) return u;
 * Devuelve el usuario o una respuesta 401 lista para devolver.
 */
export async function exigirUsuario(request: Request): Promise<Usuario | Response> {
  const cookie = leerCookie(request, NOMBRE_COOKIE);
  if (!cookie) return noAutorizado("Inicia sesión.");
  try {
    // `true`: comprueba también que la sesión no se haya revocado.
    const decodificado = await auth().verifySessionCookie(cookie, true);
    if (!correoPermitido(decodificado.email)) return noAutorizado("Inicia sesión.");
    return { uid: decodificado.uid, email: decodificado.email };
  } catch {
    return noAutorizado("La sesión no es válida o caducó.");
  }
}

/** Opciones de la cookie. `secure` solo en producción: en http://localhost no se guardaría. */
export function opcionesCookie(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSegundos,
  };
}
