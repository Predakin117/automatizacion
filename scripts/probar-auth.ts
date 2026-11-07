/**
 * Fase A: comprueba la autenticación contra la app (local o desplegada).
 *   npx tsx scripts/probar-auth.ts http://localhost:3000
 * Crea un usuario temporal NO autorizado para probar el 403 y lo borra al terminar.
 */
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { appAdmin, cargarEntorno } from "./lib/entorno";
import { cookieDeSesion, idTokenDe } from "./lib/sesion-prueba";

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle: string): void {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre} → ${detalle}`);
}

async function main(): Promise<void> {
  cargarEntorno();
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`Probando ${base}\n`);

  // 1. Sin sesión: TODAS las rutas de la API responden 401 (Fase D).
  const lote = "LoteDePrueba123";
  const hash = "0".repeat(64);
  const rutas: [string, string][] = [
    ["GET", "/api/salud"], ["GET", "/api/sesion"],
    ["GET", "/api/procesos"], ["POST", "/api/procesos"], ["GET", `/api/procesos/${lote}`],
    ["POST", `/api/procesos/${lote}/imagenes?indice=0&nombre=a.png`], ["POST", `/api/procesos/${lote}/iniciar`],
    ["POST", `/api/procesos/${lote}/lote`], ["POST", `/api/procesos/${lote}/finalizar`],
    ["GET", `/api/procesos/${lote}/excel`], ["GET", `/api/procesos/${lote}/facturas`],
    ["POST", `/api/procesos/${lote}/regenerar-excel`], ["GET", "/api/metricas"],
    ["GET", "/api/facturas"], ["GET", `/api/facturas/${hash}`], ["PUT", `/api/facturas/${hash}`],
    ["GET", `/api/facturas/${hash}/imagen`], ["POST", "/api/datos/borrar"],
  ];
  const abiertas: string[] = [];
  for (const [metodo, ruta] of rutas) {
    const r = await fetch(base + ruta, { method: metodo, body: metodo === "GET" ? undefined : "{}", headers: { "content-type": "application/json" } });
    if (r.status !== 401) abiertas.push(`${metodo} ${ruta} → ${r.status}`);
  }
  comprobar(`sin cookie: las ${rutas.length} rutas de la API dan 401`, abiertas.length === 0, abiertas.join(", "));
  const pagina = await fetch(base + "/", { redirect: "manual" });
  comprobar(
    "sin cookie GET / redirige a /login",
    pagina.status >= 300 && pagina.status < 400 && (pagina.headers.get("location") ?? "").includes("/login"),
    `${pagina.status} ${pagina.headers.get("location")}`,
  );

  // 2. Tokens y cookies inventados
  const inventado = await fetch(base + "/api/sesion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "x".repeat(200) }),
  });
  comprobar("token inventado POST /api/sesion", inventado.status === 401, String(inventado.status));
  const cookieFalsa = await fetch(base + "/api/procesos", { headers: { cookie: "sesion=falsa" } });
  comprobar("cookie inventada GET /api/procesos", cookieFalsa.status === 401, String(cookieFalsa.status));

  // 3. Usuario autorizado
  const cookie = await cookieDeSesion(base);
  comprobar("login del usuario autorizado", cookie.startsWith("sesion="), "cookie recibida");
  const yo = await fetch(base + "/api/sesion", { headers: { cookie } });
  comprobar("GET /api/sesion devuelve el correo", yo.ok && !!((await yo.json()) as { email?: string }).email, String(yo.status));
  const procesos = await fetch(base + "/api/procesos", { headers: { cookie } });
  comprobar("con cookie GET /api/procesos", procesos.status === 200, String(procesos.status));
  const salud = await fetch(base + "/api/salud", { headers: { cookie } });
  const cuerpoSalud = (await salud.json()) as { ok?: boolean; variablesFaltantes?: string[] };
  comprobar("con cookie GET /api/salud", salud.status === 200 && cuerpoSalud.ok === true, JSON.stringify(cuerpoSalud));
  const conPagina = await fetch(base + "/", { headers: { cookie }, redirect: "manual" });
  comprobar("con cookie GET / no redirige", conPagina.status === 200, String(conPagina.status));
  const salir = await fetch(base + "/api/sesion", { method: "DELETE", headers: { cookie } });
  comprobar(
    "cerrar sesión borra la cookie",
    salir.ok && /sesion=;|Max-Age=0/i.test(salir.headers.get("set-cookie") ?? ""),
    String(salir.status),
  );

  // 4. Usuario con cuenta válida pero NO autorizado → 403
  const auth = getAuth(appAdmin());
  const intruso = await auth.createUser({ email: `no-autorizado-${randomUUID().slice(0, 8)}@ejemplo.com` });
  try {
    const r = await fetch(base + "/api/sesion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: await idTokenDe(intruso.uid) }),
    });
    comprobar("correo fuera de USUARIOS_PERMITIDOS", r.status === 403, String(r.status));
  } finally {
    await auth.deleteUser(intruso.uid); // limpia solo lo que creó
  }

  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
