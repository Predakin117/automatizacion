/**
 * Prueba del enderezado automático (OCR real, sin base de datos).
 *   npx tsx scripts/probar-giro.ts <carpetaImagenes> [archivosDerechos] [archivosGirados] [--fixture salida.txt]
 * 1. Toma facturas que se leen bien, las gira 90°, 180° y 270° a propósito y comprueba que
 *    leerFactura las endereza: mismo número, aceptadas, con el giro inverso detectado.
 * 2. Lee facturas que vienen giradas de origen y muestra el resultado.
 * --fixture guarda el texto CRUDO del OCR de una imagen girada (para las pruebas unitarias).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { girar, leerFactura } from "../src/lib/ocr/leer-factura";
import { cerrarMotor, leerImagen } from "../src/lib/ocr/motor";

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
  // Argumentos posicionales (sin las opciones --fixture y su valor).
  const pos = process.argv.slice(2).filter((a, i, l) => !a.startsWith("--") && !(l[i - 1] ?? "").startsWith("--"));
  const carpeta = pos[0];
  if (!carpeta) {
    console.log("Uso: npx tsx scripts/probar-giro.ts <imagenes> [derechos,coma] [girados,coma] [--fixture salida.txt]");
    process.exitCode = 1;
    return;
  }
  const todos = readdirSync(carpeta);
  const buscar = (lista: string) =>
    lista.split(",").filter(Boolean).map((a) => todos.find((t) => t === a || t.replace(/\.[^.]+$/, "") === a) ?? a);
  // "ninguno" omite un grupo.
  const derechos = pos[1] === "ninguno" ? [] : buscar(pos[1] ?? "factura_0001,factura_0002,factura_0005,factura_0008");
  const girados = pos[2] === "ninguno" ? [] : buscar(pos[2] ?? "factura_0141,factura_0189");

  const fixture = opcion("--fixture");
  for (const archivo of derechos) {
    const imagen = readFileSync(path.join(carpeta, archivo));
    const t0 = Date.now();
    const referencia = await leerFactura(imagen);
    console.log(`\n${archivo}: derecha → ${referencia.parcial.numero} (${referencia.motivos.length ? "revisión" : "aceptada"}, ${Date.now() - t0} ms)`);
    for (const grados of [90, 180, 270]) {
      const girada = await girar(imagen, grados);
      if (fixture && grados === 90 && archivo === derechos[0]) {
        writeFileSync(fixture, (await leerImagen(girada, "original")).texto);
        console.log(`      texto crudo de la imagen girada 90° guardado en ${fixture}`);
      }
      const t = Date.now();
      const r = await leerFactura(girada);
      const esperado = (360 - grados) % 360; // para enderezarla hay que girar al revés
      comprobar(
        `${archivo} girada ${grados}° se endereza`,
        r.rotacion === esperado && r.parcial.numero === referencia.parcial.numero && r.motivos.length === referencia.motivos.length,
        `giro aplicado ${r.rotacion}°, ${r.parcial.numero}, ${r.motivos.length ? "revisión: " + r.motivos.join("; ") : "aceptada"}, ${r.lecturas} lecturas, ${Date.now() - t} ms`,
      );
    }
  }

  console.log("");
  for (const archivo of girados) {
    const t = Date.now();
    const r = await leerFactura(readFileSync(path.join(carpeta, archivo)));
    console.log(
      `      ${archivo} (girada de origen): giro aplicado ${r.rotacion}°, ${r.parcial.numero ?? "sin número"}, ` +
        `${r.motivos.length ? "revisión: " + r.motivos.join("; ") : "ACEPTADA"}, ${r.lecturas} lecturas, ${Date.now() - t} ms`,
    );
  }
  await cerrarMotor();
  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main();
