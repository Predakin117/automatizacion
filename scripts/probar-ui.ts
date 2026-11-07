/**
 * Fase 8: prueba de la interfaz con navegador real (Playwright sobre Microsoft Edge instalado).
 *   npx tsx scripts/probar-ui.ts <url> <carpetaImagenes> <porLote> <carpetaCapturas> [--cantidad N] [--desde N] [--sin-procesar]
 * Inicia sesión, elige una CARPETA, sube y procesa por lotes, espera a que terminen, abre
 * Métricas y Detalle, comprueba que «Borrar todo» exige escribir BORRAR (SIN pulsarlo nunca)
 * y limpia SOLO los lotes que creó. Debe terminar con 0 errores de consola.
 * --sin-procesar bloquea las llamadas de OCR para medir solo la subida (y el retraso del
 * bucle de eventos del navegador).
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { chromium, type Page } from "playwright";
import { appAdmin, cargarEntorno } from "./lib/entorno";
import { limpiarLote } from "./lib/limpiar";
import { cookieDeSesion } from "./lib/sesion-prueba";

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ""): void {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? " → " + detalle : ""}`);
}
const opcion = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  cargarEntorno();
  const [base0, origen, porLoteTxt = "10", capturas = "capturas"] = process.argv.slice(2);
  if (!base0 || !origen) {
    console.log("Uso: npx tsx scripts/probar-ui.ts <url> <imagenes> <porLote> <capturas> [--cantidad N] [--desde N] [--sin-procesar]");
    process.exitCode = 1;
    return;
  }
  const base = base0.replace(/\/$/, "");
  const sinProcesar = process.argv.includes("--sin-procesar");
  const cantidad = Number(opcion("--cantidad") ?? 20);
  const desde = Number(opcion("--desde") ?? 0);
  mkdirSync(capturas, { recursive: true });

  // Copia las imágenes a una carpeta temporal: se elige como CARPETA (webkitdirectory).
  const carpeta = path.join(os.tmpdir(), `facturas-ui-${Date.now()}`);
  mkdirSync(carpeta);
  const elegidas = readdirSync(origen).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().slice(desde, desde + cantidad);
  for (const f of elegidas) copyFileSync(path.join(origen, f), path.join(carpeta, f));

  const navegador = await chromium.launch({ channel: "msedge", headless: true });
  const lotes = new Set<string>();
  try {
    // ───────── login: un correo con cuenta pero NO autorizado ve el rechazo ─────────
    const auth = getAuth(appAdmin());
    const clave = `Temporal-${randomUUID()}`;
    const intruso = await auth.createUser({ email: `ui-no-autorizado-${randomUUID().slice(0, 8)}@ejemplo.com`, password: clave });
    try {
      const p = await navegador.newPage();
      await p.goto(`${base}/`);
      comprobar("sin sesión, / redirige a /login", p.url().includes("/login"));
      await p.getByLabel("Correo").fill(intruso.email!);
      await p.getByLabel("Contraseña").fill(clave);
      await p.getByRole("button", { name: "Entrar" }).click();
      // (Next también tiene un anunciador de rutas con role="alert": se busca por el texto.)
      const alerta = p.getByText("Este correo no está autorizado.");
      const visto = await alerta.waitFor({ timeout: 20_000 }).then(() => true, () => false);
      comprobar("login de correo no autorizado muestra el rechazo", visto);
      await p.close();
    } finally {
      await auth.deleteUser(intruso.uid);
    }

    // ───────── sesión del usuario autorizado ─────────
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const [nombre, valor] = (await cookieDeSesion(base)).split("=");
    const url = new URL(base);
    await contexto.addCookies([{ name: nombre, value: valor, domain: url.hostname, path: "/", httpOnly: true, secure: url.protocol === "https:", sameSite: "Lax" }]);
    const page = await contexto.newPage();
    const erroresConsola: string[] = [];
    page.on("console", (m) => m.type() === "error" && erroresConsola.push(`${m.text()} (${m.location().url})`));
    page.on("pageerror", (e) => erroresConsola.push(e.message));
    if (sinProcesar) {
      await page.route("**/api/procesos/*/lote", (r) => r.fulfill({ json: { reclamados: 0 } }));
      await page.route("**/api/procesos/*/finalizar", (r) => r.fulfill({ json: { listo: true } }));
    }

    await page.goto(`${base}/`);
    await page.getByRole("heading", { name: "Procesar facturas" }).waitFor();
    // Mide el peor retraso del bucle de eventos (¿se bloquea la página al subir?).
    await page.evaluate(() => {
      const w = window as unknown as { __retraso: number };
      w.__retraso = 0;
      let antes = performance.now();
      setInterval(() => {
        const ahora = performance.now();
        w.__retraso = Math.max(w.__retraso, ahora - antes - 50);
        antes = ahora;
      }, 50);
    });
    await page.locator('input[data-prueba="carpeta"]').setInputFiles(carpeta);
    await page.getByText(`${elegidas.length} imágenes`).waitFor();
    comprobar("la carpeta se eligió", true, `${elegidas.length} imágenes`);
    await page.locator('input[data-prueba="por-lote"]').fill(porLoteTxt);
    const esperados = Math.ceil(elegidas.length / Number(porLoteTxt));
    await page.getByText(`${esperados} ${esperados === 1 ? "lote" : "lotes"} (0 = todo en uno)`).waitFor();
    await page.screenshot({ path: path.join(capturas, "1-seleccion.png"), fullPage: true });

    const t0 = Date.now();
    await page.getByRole("button", { name: "Subir y procesar" }).click();
    const lista = page.locator('[data-prueba="lotes-sesion"] > li');
    // Espera a que termine la subida (el botón de elegir vuelve a estar activo).
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-prueba="lotes-sesion"] > li').length === n && !document.querySelector('input[data-prueba="carpeta"]')?.hasAttribute("disabled"),
      esperados,
      { timeout: 10 * 60_000 },
    );
    const tSubida = Date.now() - t0;
    for (const href of await lista.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
      lotes.add(href.split("/").pop()!);
    }
    const retraso = await page.evaluate(() => (window as unknown as { __retraso: number }).__retraso);
    comprobar(`${esperados} lotes creados y subidos`, lotes.size === esperados, `${(tSubida / 1000).toFixed(1)} s, retraso máximo del navegador ${Math.round(retraso)} ms`);

    if (!sinProcesar) {
      // El Motor procesa en segundo plano; la lista muestra «Terminado» al acabar cada lote.
      await page.waitForFunction(
        (n) => [...document.querySelectorAll('[data-prueba="lotes-sesion"] > li')].filter((li) => li.textContent?.includes("Terminado")).length === n,
        esperados,
        { timeout: 30 * 60_000, polling: 2000 },
      );
      comprobar("todos los lotes terminaron", true, `${((Date.now() - t0) / 1000).toFixed(1)} s en total`);
      await page.screenshot({ path: path.join(capturas, "2-procesado.png"), fullPage: true });

      // Métricas
      await page.getByRole("link", { name: "Métricas" }).click();
      await page.getByText("Leídas correctamente").first().waitFor();
      const filas = await page.locator('[data-prueba="tabla-lotes"] tbody tr').count();
      comprobar("Métricas muestra los lotes", filas >= esperados, `${filas} filas`);
      await page.screenshot({ path: path.join(capturas, "3-metricas.png"), fullPage: true });

      // Detalle del primer lote
      const primero = [...lotes][0];
      await page.goto(`${base}/procesos/${primero}`);
      await page.locator('[data-prueba="tabla-facturas"]').waitFor({ timeout: 60_000 });
      const facturas = await page.locator('[data-prueba="tabla-facturas"] tbody tr').count();
      comprobar("Detalle muestra la tabla de facturas", facturas === Math.min(Number(porLoteTxt), elegidas.length), `${facturas} facturas`);
      const excel = await page.request.get(`${base}/api/procesos/${primero}/excel`);
      comprobar("el Excel se descarga", excel.ok());
      const imagen = page.locator('[data-prueba="tabla-facturas"] tbody tr a').first();
      const img = await page.request.get(base + ((await imagen.getAttribute("href")) ?? ""));
      comprobar("la imagen original se sirve", img.ok() && (img.headers()["content-type"] ?? "").startsWith("image/"));
      await page.screenshot({ path: path.join(capturas, "4-detalle.png"), fullPage: true });
    }

    // «Borrar todo»: solo se comprueba que exige BORRAR; NUNCA se pulsa contra datos reales.
    await page.goto(`${base}/metricas`);
    await page.getByRole("button", { name: "Borrar todo…" }).click();
    const boton = page.getByRole("button", { name: "Borrar todo", exact: true });
    comprobar("el borrado está deshabilitado sin escribir", await boton.isDisabled());
    await page.locator('[data-prueba="confirmar-borrado"]').fill("BORRA");
    comprobar("el borrado sigue deshabilitado con un texto distinto", await boton.isDisabled());
    await page.locator('[data-prueba="confirmar-borrado"]').fill("BORRAR");
    comprobar("con BORRAR se habilita (no se pulsa)", await boton.isEnabled());
    await page.getByRole("button", { name: "Cancelar" }).click();

    await revisarMovil(contexto.newPage.bind(contexto), base, capturas);
    comprobar("0 errores de consola", erroresConsola.length === 0, erroresConsola.slice(0, 5).join(" | "));
  } finally {
    await navegador.close();
    rmSync(carpeta, { recursive: true, force: true });
    for (const id of lotes) console.log(`limpieza ${id}:`, JSON.stringify(await limpiarLote(id)));
  }
  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

/** Ancho de teléfono: la página no debe tener scroll horizontal (las tablas hacen scroll propio). */
async function revisarMovil(nueva: () => Promise<Page>, base: string, capturas: string): Promise<void> {
  const p = await nueva();
  await p.setViewportSize({ width: 390, height: 844 });
  for (const ruta of ["/", "/metricas"]) {
    await p.goto(base + ruta);
    await p.waitForLoadState("networkidle");
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    comprobar(`móvil ${ruta}: sin scroll horizontal`, desborde <= 1, `${desborde}px`);
    await p.screenshot({ path: path.join(capturas, `movil${ruta.replace("/", "-") || "-inicio"}.png`), fullPage: true });
  }
  await p.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
