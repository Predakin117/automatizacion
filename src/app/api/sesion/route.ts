import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/firebase/admin";
import {
  DURACION_SESION_MS,
  NOMBRE_COOKIE,
  correoPermitido,
  exigirUsuario,
  opcionesCookie,
} from "@/lib/auth/sesion";

const Cuerpo = z.object({ idToken: z.string().min(20).max(5000) });

/** Login: cambia el ID token de Firebase por una cookie de sesión httpOnly. */
export async function POST(request: Request) {
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Falta el token." }, { status: 400 });

  let email: string | undefined;
  try {
    email = (await auth().verifyIdToken(cuerpo.data.idToken, true)).email;
  } catch {
    return Response.json({ error: "Token inválido." }, { status: 401 });
  }
  if (!correoPermitido(email)) {
    return Response.json({ error: "Este correo no está autorizado." }, { status: 403 });
  }

  // createSessionCookie exige un inicio de sesión reciente (menos de 5 min).
  const cookie = await auth().createSessionCookie(cuerpo.data.idToken, {
    expiresIn: DURACION_SESION_MS,
  });
  const respuesta = NextResponse.json({ email });
  respuesta.cookies.set(NOMBRE_COOKIE, cookie, opcionesCookie(DURACION_SESION_MS / 1000));
  return respuesta;
}

/** Quién soy (lo usa el menú). */
export async function GET(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  return Response.json({ email: u.email });
}

/** Cerrar sesión: borra la cookie. */
export async function DELETE() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(NOMBRE_COOKIE, "", opcionesCookie(0));
  return respuesta;
}
