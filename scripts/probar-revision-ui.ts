/**
 * Fase 9: prueba de la revisión manual con navegador real y datos reales.
 *   npx tsx scripts/probar-revision-ui.ts <url> <carpetaImagenes> <carpetaCapturas> [--archivos a.jpg,b.png,…]
 * Procesa por HTTP unas facturas que van a revisión, y en el navegador: lista, formulario,
 * imagen visible, giro (las dimensiones se intercambian; el servidor rechaza 45°), validación
 * en vivo (un total equivocado exige confirmar), guardado y salto a la siguiente, métricas,
 * detalle del lote y Excel regenerado. 0 errores de consola. Limpia SOLO lo que creó.
 */
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import ExcelJS from "exceljs";
import { chromium, type Page } from "playwright";
import { db } from "../src/lib/firebase/admin";
import { COLECCIONES, type Factura } from "../src/lib/modelo/tipos";
import { calcularDv } from "../src/lib/ocr/nit";
import { cargarEntorno } from "./lib/entorno";
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

/** Sube y procesa por HTTP (como el navegador) y devuelve el id del lote. */
async function procesarPorHttp(base: string, cookie: string, carpeta: string, archivos: string[], alCrear: (id: string) => void): Promise<string> {
  const api = (ruta: string, init: RequestInit = {}) => fetch(base + ruta, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
  const { id } = (await (
    await api("/api/procesos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ carpeta: "prueba-revision-ui", totalArchivos: archivos.length }) })
  ).json()) as { id: string };
  alCrear(id); // se registra YA: si algo falla después, la limpieza lo encuentra
  for (const [i, a] of archivos.entries()) {
    const r = await api(`/api/procesos/${id}/imagenes?indice=${i}&nombre=${encodeURIComponent(a)}`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: readFileSync(path.join(carpeta, a)),
    });
    if (r.status !== 201) throw new Error(`subida de ${a}: ${r.status}`);
  }
  await api(`/api/procesos/${id}/iniciar`, { method: "POST" });
  const motor = async () => {
    for (;;) {
      const r = (await (await api(`/api/procesos/${id}/lote`, { method: "POST" })).json()) as { reclamados: number };
      if (r.reclamados === 0) return;
    }
  };
  await Promise.all([motor(), motor(), motor()]);
  for (;;) {
    const f = (await (await api(`/api/procesos/${id}/finalizar`, { method: "POST" })).json()) as { listo: boolean };
    if (f.listo) return id;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const valor = (p: Page, campo: string) => p.locator(`input[data-prueba="${campo}"]:visible`).inputValue();
const poner = (p: Page, campo: string, v: string) => p.locator(`input[data-prueba="${campo}"]:visible`).fill(v);

/** Completa lo que la máquina no leyó y corrige los DV (como haría una persona mirando la imagen). */
async function completar(p: Page): Promise<void> {
  if (!/^FE-\d{6}$/.test(await valor(p, "numero"))) await poner(p, "numero", `FE-9${String(randomInt(0, 99999)).padStart(5, "0")}`);
  if (!(await valor(p, "fecha"))) await poner(p, "fecha", "2026-01-15");
  if ((await valor(p, "proveedor")).length < 3) await poner(p, "proveedor", "Proveedor Revisado S.A.S.");
  if ((await valor(p, "cliente")).length < 3) await poner(p, "cliente", "Cliente Revisado S.A.S.");
  for (const [doc, dv] of [["nit", "dv"], ["documento", "dv-cliente"]]) {
    let n = (await valor(p, doc)).replace(/\D/g, "");
    if (n.length < 5) {
      n = String(randomInt(800_000_000, 899_999_999));
      await poner(p, doc, n);
    }
    await poner(p, dv, String(calcularDv(n)));
  }
  const fila = p.locator("form:visible .grid-cols-\\[1fr_5rem_8rem_auto\\]").first().locator("input");
  if (!(await fila.nth(0).inputValue())) await fila.nth(0).fill("Servicio revisado a mano");
  if (!(await fila.nth(2).inputValue())) await fila.nth(2).fill("100000");
  if (!(await valor(p, "subtotal")) || !(await valor(p, "total")) || !(await valor(p, "iva"))) {
    await p.getByRole("button", { name: "Recalcular" }).click();
  }
}

async function dimensiones(p: Page): Promise<[number, number]> {
  const img = p.locator('img[data-prueba="imagen-factura"]:visible');
  await p.waitForFunction(() => {
    const i = [...document.querySelectorAll<HTMLImageElement>('img[data-prueba="imagen-factura"]')].find((x) => x.offsetParent);
    return !!i && i.complete && i.naturalWidth > 0;
  });
  return img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight] as [number, number]);
}

async function main(): Promise<void> {
  cargarEntorno();
  const [base0, carpeta, capturas = "capturas-revision"] = process.argv.slice(2);
  if (!base0 || !carpeta) {
    console.log("Uso: npx tsx scripts/probar-revision-ui.ts <url> <imagenes> <capturas> [--archivos a,b,…]");
    process.exitCode = 1;
    return;
  }
  const base = base0.replace(/\/$/, "");
  mkdirSync(capturas, { recursive: true });
  // Por defecto, 4 facturas que se vio que van a revisión (sin importar su extensión).
  const todos = readdirSync(carpeta);
  const archivos = (opcion("--archivos") ?? "factura_0113,factura_0139,factura_0164,factura_0189")
    .split(",")
    .map((a) => todos.find((t) => t === a || t.replace(/\.[^.]+$/, "") === a) ?? a);
  const cookie = await cookieDeSesion(base);
  let lote: string | null = null;
  const navegador = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await procesarPorHttp(base, cookie, carpeta, archivos, (id) => (lote = id));
    const enRevision = await db().collection(COLECCIONES.facturas).where("procesoId", "==", lote).where("estado", "==", "revision").get();
    const pendientes = enRevision.docs.map((d) => ({ hash: d.id, archivo: (d.data() as Factura).archivo }));
    comprobar("las facturas de prueba quedaron en revisión", pendientes.length > 0, `${pendientes.length} de ${archivos.length}`);

    const contexto = await navegador.newContext({ viewport: { width: 1400, height: 1000 } });
    const [n, v] = cookie.split("=");
    const url = new URL(base);
    await contexto.addCookies([{ name: n, value: v, domain: url.hostname, path: "/", httpOnly: true, secure: url.protocol === "https:", sameSite: "Lax" }]);
    const p = await contexto.newPage();
    const errores: string[] = [];
    p.on("console", (m) => m.type() === "error" && errores.push(`${m.text()} (${m.location().url})`));
    p.on("pageerror", (e) => errores.push(e.message));

    // Lista
    await p.goto(`${base}/revision`);
    await p.locator('[data-prueba="lista-revision"]').waitFor();
    const texto = await p.locator('[data-prueba="lista-revision"]').innerText();
    comprobar("la lista muestra las pendientes", pendientes.every((x) => texto.includes(x.archivo)));
    await p.screenshot({ path: path.join(capturas, "1-lista.png"), fullPage: true });

    // Primera: imagen, giro y validación en vivo
    await p.goto(`${base}/revision/${pendientes[0].hash}`);
    const [ancho, alto] = await dimensiones(p);
    comprobar("la imagen se ve", ancho > 0 && alto > 0, `${ancho}×${alto}`);
    await p.getByRole("button", { name: "Girar a la derecha" }).click();
    await p.waitForFunction(() => document.querySelector<HTMLImageElement>('img[data-prueba="imagen-factura"]')?.src.includes("rotar=90"));
    const [ancho2, alto2] = await dimensiones(p);
    comprobar("al girar se intercambian las dimensiones", ancho2 === alto && alto2 === ancho, `${ancho2}×${alto2}`);
    const mal = await p.request.get(`${base}/api/facturas/${pendientes[0].hash}/imagen?rotar=45`);
    comprobar("el servidor rechaza girar 45°", mal.status() === 400);

    await completar(p);
    const guardar = p.locator('button[data-prueba="guardar"]:visible');
    const totalBueno = await valor(p, "total");
    await poner(p, "total", String(Number(totalBueno) + 1000));
    await p.locator('[data-prueba="motivos-formulario"]:visible').waitFor();
    comprobar("un total equivocado exige confirmar", await guardar.isDisabled());
    await p.locator('input[data-prueba="confirmar"]:visible').check();
    comprobar("al confirmar: «Guardar de todos modos»", (await guardar.isEnabled()) && (await guardar.innerText()).includes("Guardar de todos modos"));
    await poner(p, "total", totalBueno);
    await p.screenshot({ path: path.join(capturas, "2-formulario.png"), fullPage: true });

    // Guardar todas, una tras otra (el formulario salta a la siguiente pendiente).
    let guardadas = 0;
    for (const f of pendientes) {
      if (!p.url().includes(f.hash)) await p.goto(`${base}/revision/${f.hash}`);
      await dimensiones(p);
      await completar(p);
      const confirmar = p.locator('input[data-prueba="confirmar"]:visible');
      if (await confirmar.count()) await confirmar.check(); // incoherencia real de la factura (p. ej. IVA al 5 %)
      if (!(await guardar.isEnabled())) {
        comprobar(`${f.archivo}: el formulario se puede guardar`, false, await p.locator("form:visible").innerText());
        continue;
      }
      const antes = p.url();
      await guardar.click();
      await p.waitForURL((u) => u.toString() !== antes, { timeout: 30_000 });
      guardadas++;
    }
    comprobar("todas las pendientes se guardaron y el formulario saltó a la siguiente", guardadas === pendientes.length, `${guardadas}/${pendientes.length}`);
    const quedan = await db().collection(COLECCIONES.facturas).where("procesoId", "==", lote).where("estado", "==", "revision").count().get();
    comprobar("ya no quedan en revisión en este lote", quedan.data().count === 0);

    // Métricas
    await p.goto(`${base}/metricas`);
    await p.locator("select[data-prueba='selector-lote']").selectOption(lote);
    const frase = p.getByText(/ya\s+se revisaron a mano/);
    await frase.waitFor();
    comprobar("Métricas: revisadas a mano", (await p.locator("main:visible").innerText()).includes("ya se revisaron a mano") || (await frase.count()) > 0);
    await p.screenshot({ path: path.join(capturas, "3-metricas.png"), fullPage: true });

    // Detalle + Excel regenerado
    await p.goto(`${base}/procesos/${lote}`);
    await p.getByRole("button", { name: "Regenerar el Excel con las correcciones a mano" }).click();
    await p.getByText("Excel regenerado con las correcciones a mano.").waitFor({ timeout: 60_000 });
    const xr = await p.request.get(`${base}/api/procesos/${lote}/excel`);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await xr.body()) as unknown as ArrayBuffer);
    let manuales = 0;
    libro.getWorksheet("Facturas")!.eachRow((fila) => {
      if (fila.values && (fila.values as unknown[]).includes("aceptada (manual)")) manuales++;
    });
    comprobar("el Excel regenerado incluye las correcciones", manuales === pendientes.length, `${manuales} filas «aceptada (manual)»`);
    await p.screenshot({ path: path.join(capturas, "4-detalle.png"), fullPage: true });

    comprobar("0 errores de consola", errores.length === 0, errores.slice(0, 5).join(" | "));
  } finally {
    await navegador.close();
    if (lote) console.log("limpieza:", JSON.stringify(await limpiarLote(lote)));
  }
  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
