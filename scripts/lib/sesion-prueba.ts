import { getAuth } from "firebase-admin/auth";
import { appAdmin, requerir } from "./entorno";

/**
 * Para pruebas automáticas: obtiene un ID token de un usuario SIN conocer su contraseña.
 * firebase-admin firma un "custom token" y la API pública de Firebase lo cambia por un
 * ID token normal (lo mismo que devuelve el login del navegador).
 */
export async function idTokenDe(uid: string): Promise<string> {
  const customToken = await getAuth(appAdmin()).createCustomToken(uid);
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(
      requerir("NEXT_PUBLIC_FIREBASE_API_KEY"),
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!r.ok) throw new Error(`signInWithCustomToken respondió ${r.status}`);
  return ((await r.json()) as { idToken: string }).idToken;
}

/** Primer usuario de Auth cuyo correo está en USUARIOS_PERMITIDOS. */
export async function usuarioAutorizado(): Promise<{ uid: string; email: string }> {
  const permitidos = new Set(
    (process.env.USUARIOS_PERMITIDOS ?? "")
      .split(",")
      .map((c) => c.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
      .filter(Boolean),
  );
  const { users } = await getAuth(appAdmin()).listUsers(1000);
  const u = users.find((x) => x.email && permitidos.has(x.email.toLowerCase()));
  if (!u?.email) throw new Error("Ningún usuario de Auth está en USUARIOS_PERMITIDOS");
  return { uid: u.uid, email: u.email };
}

/**
 * Inicia sesión contra la app (POST /api/sesion) y devuelve la cabecera Cookie lista
 * para usar. Si se definen CORREO y CLAVE se usa el login con contraseña.
 */
export async function cookieDeSesion(base: string): Promise<string> {
  let idToken: string;
  const correo = process.env.CORREO?.trim();
  const clave = process.env.CLAVE;
  if (correo && clave) {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
        requerir("NEXT_PUBLIC_FIREBASE_API_KEY"),
      )}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: correo, password: clave, returnSecureToken: true }),
      },
    );
    if (!r.ok) throw new Error(`login con contraseña respondió ${r.status}`);
    idToken = ((await r.json()) as { idToken: string }).idToken;
  } else {
    idToken = await idTokenDe((await usuarioAutorizado()).uid);
  }
  const r = await fetch(`${base}/api/sesion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!r.ok) throw new Error(`POST /api/sesion respondió ${r.status}`);
  const setCookie = r.headers.get("set-cookie") ?? "";
  const valor = /sesion=([^;]+)/.exec(setCookie)?.[1];
  if (!valor) throw new Error("La respuesta no trajo la cookie de sesión");
  return `sesion=${valor}`;
}
