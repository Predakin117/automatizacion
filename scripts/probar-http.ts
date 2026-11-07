/**
 * Recorrido completo POR HTTP contra la app (local o desplegada), como lo haría el navegador:
 *   npx tsx scripts/probar-http.ts <url> <carpetaImagenes> [cantidad=10] [--desde N] [--conservar]
 * 1. La subida rechaza: sin sesión (401), texto con nombre .png (415), PNG dañado (415),
 *    más de 4 MB (413), lote inexistente o ajeno (404), índice inválido (400).
 * 2. Crea un lote, sube las imágenes (6 en paralelo), inicia, procesa con 3 llamadas
 *    concurrentes a /lote, finaliza y descarga el Excel: su suma de Total = Firestore.
 * 3. Reprocesa las MISMAS imágenes en otro lote (otra ruta): todo duplicado y los conteos
 *    de facturas y clientes no cambian (idempotencia).
 * 4. Limpia SOLO lo que creó (salvo --conservar).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../src/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Factura } from "../src/lib/modelo/tipos";
import { reclamar } from "../src/lib/procesamiento/cola";
import { cargarEntorno } from "./lib/entorno";
import { limpiarLote } from "./lib/limpiar";
import { cookieDeSesion } from "./lib/sesion-prueba";

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ""): void {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? " → " + detalle : ""}`);
}

function opcion(n: string): string | undefined {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  cargarEntorno();
  const [base0, carpeta, cantidadTxt = "10"] = process.argv.slice(2);
  if (!base0 || !carpeta) {
    console.log("Uso: npx tsx scripts/probar-http.ts <url> <carpetaImagenes> [cantidad] [--desde N] [--conservar]");
    process.exitCode = 1;
    return;
  }
  const base = base0.replace(/\/$/, "");
  const cantidad = Number(cantidadTxt);
  const desde = Number(opcion("--desde") ?? 0);
  const archivos = readdirSync(carpeta).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().slice(desde, desde + cantidad);
  const cookie = await cookieDeSesion(base);
  const api = (ruta: string, init: RequestInit = {}) =>
    fetch(base + ruta, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
  const json = async <T>(r: Response): Promise<T> => (await r.json()) as T;
  const creados: string[] = [];
  const f = db();

  try {
    // ───────── 1. rechazos de la subida ─────────
    const crear = async (n: number) =>
      json<{ id: string }>(
        await api("/api/procesos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ carpeta: "prueba-http", totalArchivos: n }) }),
      );
    const { id: lote } = await crear(archivos.length);
    creados.push(lote);
    const subir = (id: string, indice: number | string, nombre: string, cuerpo: Uint8Array, conCookie = true) =>
      fetch(`${base}/api/procesos/${id}/imagenes?indice=${indice}&nombre=${encodeURIComponent(nombre)}`, {
        method: "POST",
        headers: { "content-type": "image/png", ...(conCookie ? { cookie } : {}) },
        body: cuerpo as BodyInit,
      });
    const unaImagen = readFileSync(path.join(carpeta, archivos[0]));
    comprobar("subida sin sesión", (await subir(lote, 0, "a.png", unaImagen, false)).status === 401);
    comprobar("texto con nombre .png", (await subir(lote, 0, "a.png", Buffer.from("hola, no soy imagen"))).status === 415);
    const pngDanado = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 3)]);
    comprobar("PNG con firma pero dañado", (await subir(lote, 0, "a.png", pngDanado)).status === 415);
    comprobar("más de 4 MB", (await subir(lote, 0, "a.png", Buffer.alloc(4 * 1024 * 1024 + 10, 1))).status === 413);
    comprobar("lote inexistente", (await subir("NoExiste123", 0, "a.png", unaImagen)).status === 404);
    const ajeno = await f.collection(COLECCIONES.procesos).add({
      uid: "otro-usuario", carpeta: "ajeno", estado: "subiendo", totalArchivos: 1, inicio: Timestamp.now(), fin: null, rutaExcel: null, finalizandoDesde: null,
    });
    try {
      comprobar("lote de otro usuario", (await subir(ajeno.id, 0, "a.png", unaImagen)).status === 404);
      comprobar("ver lote de otro usuario", (await api(`/api/procesos/${ajeno.id}`)).status === 404);
    } finally {
      await ajeno.delete();
    }
    comprobar("índice inválido", (await subir(lote, "abc", "a.png", unaImagen)).status === 400);

    const antes = {
      facturas: (await f.collection(COLECCIONES.facturas).count().get()).data().count,
      clientes: (await f.collection(COLECCIONES.clientes).count().get()).data().count,
    };

    // ───────── 2. procesar un lote ─────────
    let caidos: string[] = [];
    const procesar = async (id: string, etiqueta: string, simularCaida = false) => {
      const t0 = Date.now();
      let i = 0;
      const errores: string[] = [];
      const trabajador = async () => {
        while (i < archivos.length) {
          const k = i++;
          const tipo = /\.png$/i.test(archivos[k]) ? "image/png" : "image/jpeg";
          const r = await fetch(`${base}/api/procesos/${id}/imagenes?indice=${k}&nombre=${encodeURIComponent(archivos[k])}`, {
            method: "POST",
            headers: { "content-type": tipo, cookie },
            body: readFileSync(path.join(carpeta, archivos[k])),
          });
          if (r.status !== 201) errores.push(`${archivos[k]}: ${r.status}`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, trabajador));
      const tSubida = Date.now() - t0;
      comprobar(`${etiqueta}: ${archivos.length} imágenes subidas`, errores.length === 0, `${tSubida} ms ${errores.join(", ")}`);
      const ini = await json<{ archivos: number }>(await api(`/api/procesos/${id}/iniciar`, { method: "POST" }));
      comprobar(`${etiqueta}: cola creada`, ini.archivos === archivos.length, `${ini.archivos} en la cola`);
      // Repetir iniciar no duplica la cola.
      const ini2 = await json<{ nuevos: number }>(await api(`/api/procesos/${id}/iniciar`, { method: "POST" }));
      comprobar(`${etiqueta}: repetir iniciar no duplica`, ini2.nuevos === 0);

      if (simularCaida) {
        // Una función "se cae" con 4 archivos reclamados: quedan con arrendamiento de 5 min.
        // En vez de esperar 5 min, se hace caducar el arrendamiento; el motor debe retomarlos.
        const abandonados = await reclamar(id, 4);
        const cola = f.collection(COLECCIONES.procesos).doc(id).collection(COLECCIONES.archivos);
        for (const a of abandonados) await cola.doc(a.id).update({ disponibleDesde: Date.now() - 1 });
        caidos = abandonados.map((a) => a.id);
        console.log(`      ${etiqueta}: simulada una caída con ${caidos.length} archivos reclamados`);
      }

      const tLotes = Date.now();
      const resumenes: Record<string, number>[] = [];
      const motor = async () => {
        for (;;) {
          const r = await api(`/api/procesos/${id}/lote`, { method: "POST" });
          if (!r.ok) throw new Error(`/lote respondió ${r.status}: ${await r.text()}`);
          const res = await json<Record<string, number>>(r);
          resumenes.push(res);
          if (res.reclamados === 0) return;
        }
      };
      await Promise.all([motor(), motor(), motor()]);
      let fin: { listo: boolean; rutaExcel?: string };
      for (;;) {
        fin = await json(await api(`/api/procesos/${id}/finalizar`, { method: "POST" }));
        if (fin.listo) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      const suma = (k: string) => resumenes.reduce((a, r) => a + (r[k] ?? 0), 0);
      const ms = (Date.now() - tLotes) / 1000;
      console.log(
        `      ${etiqueta}: aceptadas ${suma("aceptadas")}, revisión ${suma("revision")}, duplicadas ${suma("duplicadas")}, ` +
          `errores ${suma("errores")}, reintentos ${suma("reintentos")} — ${ms.toFixed(1)} s (${(ms / archivos.length).toFixed(1)} s por factura)`,
      );
      return { aceptadas: suma("aceptadas"), revision: suma("revision"), duplicadas: suma("duplicadas"), errores: suma("errores") };
    };

    const r1 = await procesar(lote, "lote 1", true);
    comprobar("lote 1: todas procesadas", r1.aceptadas + r1.revision + r1.errores + r1.duplicadas === archivos.length);
    const colaLote1 = f.collection(COLECCIONES.procesos).doc(lote).collection(COLECCIONES.archivos);
    const retomados = await Promise.all(caidos.map(async (c) => (await colaLote1.doc(c).get()).data() as ArchivoCola));
    comprobar(
      "caída simulada: los archivos abandonados se retomaron una vez",
      retomados.every((a) => a.estado === "ok" && a.intentos === 2),
      retomados.map((a) => `${a.resultado}/${a.intentos} intentos`).join(", "),
    );

    // Estado y métricas del lote (1 lectura).
    const estado = await json<{ estado: string; metricas: { aceptadas: { n: number; total: number }; manuales: { total: number } } }>(
      await api(`/api/procesos/${lote}`),
    );
    comprobar("lote 1 terminado", estado.estado === "terminado");
    comprobar("métricas = resultado", estado.metricas.aceptadas.n === r1.aceptadas, `${estado.metricas.aceptadas.n}`);

    // Excel: la suma de Total coincide con Firestore.
    const xr = await api(`/api/procesos/${lote}/excel`);
    comprobar("Excel descargable", xr.ok && (xr.headers.get("content-disposition") ?? "").includes(".xlsx"));
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await xr.arrayBuffer()) as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet("Facturas")!;
    let sumaExcel = 0;
    let numericas = true;
    const colTotal = (hoja.getRow(1).values as unknown[]).indexOf("Total");
    hoja.eachRow((fila, n) => {
      if (n === 1) return;
      const v = fila.getCell(colTotal).value;
      if (v !== null && typeof v !== "number") numericas = false;
      sumaExcel += typeof v === "number" ? v : 0;
    });
    const facturas = await f.collection(COLECCIONES.facturas).where("procesoId", "==", lote).get();
    const sumaBase = facturas.docs.reduce((a, d) => a + ((d.data() as Factura).total ?? 0), 0);
    comprobar("Excel: celdas de Total numéricas", numericas);
    comprobar("Excel: suma de Total = Firestore", sumaExcel === sumaBase, `${sumaExcel} vs ${sumaBase}`);
    comprobar("Excel: una fila por factura", hoja.rowCount - 1 === facturas.size, `${hoja.rowCount - 1} filas, ${facturas.size} facturas`);

    const despues1 = {
      facturas: (await f.collection(COLECCIONES.facturas).count().get()).data().count,
      clientes: (await f.collection(COLECCIONES.clientes).count().get()).data().count,
    };
    comprobar("facturas nuevas = archivos", despues1.facturas - antes.facturas === archivos.length - r1.errores + 0, `+${despues1.facturas - antes.facturas}`);
    console.log(`      clientes nuevos: +${despues1.clientes - antes.clientes}`);

    // ───────── 3. reprocesar las mismas imágenes en otro lote ─────────
    const { id: lote2 } = await crear(archivos.length);
    creados.push(lote2);
    const r2 = await procesar(lote2, "lote 2 (mismas imágenes)");
    comprobar("reproceso: todas duplicadas", r2.duplicadas === archivos.length, `${r2.duplicadas}/${archivos.length}`);
    const despues2 = {
      facturas: (await f.collection(COLECCIONES.facturas).count().get()).data().count,
      clientes: (await f.collection(COLECCIONES.clientes).count().get()).data().count,
    };
    comprobar("reproceso: no cambia el número de facturas", despues2.facturas === despues1.facturas);
    comprobar("reproceso: no cambia el número de clientes", despues2.clientes === despues1.clientes);
    const xr2 = await api(`/api/procesos/${lote2}/excel`);
    const libro2 = new ExcelJS.Workbook();
    await libro2.xlsx.load(Buffer.from(await xr2.arrayBuffer()) as unknown as ArrayBuffer);
    comprobar("reproceso: el Excel no sale vacío", libro2.getWorksheet("Facturas")!.rowCount - 1 === facturas.size);
  } finally {
    if (process.argv.includes("--conservar")) {
      console.log(`\nLotes conservados: ${creados.join(" ")}`);
    } else {
      for (const id of creados.reverse()) console.log(`limpieza ${id}:`, JSON.stringify(await limpiarLote(id)));
    }
  }
  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
