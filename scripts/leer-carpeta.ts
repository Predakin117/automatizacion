/**
 * Mide el extractor (OCR + reintentos + validación) sobre una carpeta, SIN base de datos.
 *   npx tsx scripts/leer-carpeta.ts <carpetaImagenes> [verdad.json] [--desde N] [--cantidad N] [--json salida.json]
 * Sin verdad.json mide el porcentaje de ACEPTADAS y los motivos de revisión. Con verdad.json
 * (lo tiene el profesor) compara campo por campo y cuenta las aceptadas con error no detectado.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { leerFactura } from "../src/lib/ocr/leer-factura";
import { cerrarMotor } from "../src/lib/ocr/motor";
import type { ParcialFactura } from "../src/lib/ocr/tipos";

type Verdad = Record<string, unknown> & { archivo?: string };

function opcion(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Acepta varias formas de verdad.json: lista de facturas o { facturas: [...] }. */
function cargarVerdad(ruta: string): Map<string, Verdad> {
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as unknown;
  const lista = (Array.isArray(crudo) ? crudo : (crudo as { facturas?: Verdad[] }).facturas ?? []) as Verdad[];
  return new Map(lista.filter((v) => v.archivo).map((v) => [String(v.archivo), v]));
}

const CAMPOS: (keyof ParcialFactura)[] = [
  "numero", "fecha", "nitProveedor", "clienteDocumento", "subtotal", "iva", "impoconsumo", "total",
];

function igual(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined || a === 0) && (b === null || b === undefined || b === 0)) return true;
  return String(a).replace(/\D/g, "") === String(b).replace(/\D/g, "") && String(a) !== "" ? true : a === b;
}

async function main(): Promise<void> {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.log("Uso: npx tsx scripts/leer-carpeta.ts <imagenes> [verdad.json] [--desde N] [--cantidad N]");
    process.exitCode = 1;
    return;
  }
  const rutaVerdad = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : undefined;
  const verdad = rutaVerdad ? cargarVerdad(rutaVerdad) : null;
  const desde = Number(opcion("--desde") ?? 0);
  const cantidad = Number(opcion("--cantidad") ?? 1e9);
  const archivos = readdirSync(carpeta)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .slice(desde, desde + cantidad);

  const motivosCuenta = new Map<string, number>();
  const aciertos = new Map<string, number>();
  const resultados: unknown[] = [];
  let aceptadas = 0;
  let aceptadasConError = 0;
  const t0 = Date.now();

  for (const [i, archivo] of archivos.entries()) {
    const r = await leerFactura(readFileSync(path.join(carpeta, archivo)));
    if (r.motivos.length === 0) aceptadas++;
    for (const m of r.motivos) {
      const clave = m.replace(/\d+/g, "N");
      motivosCuenta.set(clave, (motivosCuenta.get(clave) ?? 0) + 1);
    }
    let errores: string[] = [];
    const v = verdad?.get(archivo);
    if (v) {
      errores = CAMPOS.filter((c) => !igual(r.parcial[c], v[c]));
      for (const c of CAMPOS) if (!errores.includes(c)) aciertos.set(c, (aciertos.get(c) ?? 0) + 1);
      if (r.motivos.length === 0 && errores.length > 0) aceptadasConError++;
    }
    resultados.push({ archivo, motivos: r.motivos, modo: r.modo, lecturas: r.lecturas, errores, parcial: r.parcial });
    const estado = r.motivos.length === 0 ? "OK " : "REV";
    console.log(
      `${String(i + 1).padStart(4)}/${archivos.length} ${archivo} ${estado} ${r.modo.padEnd(12)}` +
        `${r.motivos.length ? " " + r.motivos.join(" | ") : ""}${errores.length ? "  ✗ " + errores.join(",") : ""}`,
    );
  }
  await cerrarMotor();

  const n = archivos.length;
  console.log(`\nAceptadas: ${aceptadas}/${n} (${Math.round((aceptadas / n) * 100)} %) · a revisión: ${n - aceptadas}`);
  console.log(`Tiempo: ${Math.round((Date.now() - t0) / 1000)} s (${((Date.now() - t0) / n / 1000).toFixed(1)} s por factura)`);
  if (verdad) {
    console.log(`Aceptadas con error no detectado: ${aceptadasConError}`);
    console.log("Exactitud por campo: " + CAMPOS.map((c) => `${c} ${aciertos.get(c) ?? 0}`).join(", "));
  }
  console.log("Motivos de revisión:");
  for (const [m, c] of [...motivosCuenta].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(4)}  ${m}`);
  const salida = opcion("--json");
  if (salida) writeFileSync(salida, JSON.stringify(resultados, null, 2));
}

main();
