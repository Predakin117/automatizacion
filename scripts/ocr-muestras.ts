/**
 * Guarda el texto del OCR de cada imagen en los 3 modos (material para escribir el extractor).
 *   npx tsx scripts/ocr-muestras.ts <carpetaImagenes> <carpetaSalida> [cantidad] [desde]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cerrarMotor, leerImagen, type ModoLectura } from "../src/lib/ocr/motor";

async function main(): Promise<void> {
  const [entrada, salida, cantidad = "10", desde = "0"] = process.argv.slice(2);
  if (!entrada || !salida) {
    console.log("Uso: npx tsx scripts/ocr-muestras.ts <imagenes> <salida> [cantidad] [desde]");
    process.exitCode = 1;
    return;
  }
  mkdirSync(salida, { recursive: true });
  const archivos = readdirSync(entrada)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .slice(Number(desde), Number(desde) + Number(cantidad));
  const modos: ModoLectura[] = ["original", "preprocesado", "encabezado"];
  for (const archivo of archivos) {
    const imagen = readFileSync(path.join(entrada, archivo));
    for (const modo of modos) {
      const t0 = Date.now();
      const { texto, confianza } = await leerImagen(imagen, modo);
      const base = archivo.replace(/\.[^.]+$/, "");
      writeFileSync(path.join(salida, `${base}.${modo}.txt`), texto);
      console.log(`${archivo} ${modo.padEnd(12)} confianza ${confianza} (${Date.now() - t0} ms)`);
    }
  }
  await cerrarMotor();
}

main();
