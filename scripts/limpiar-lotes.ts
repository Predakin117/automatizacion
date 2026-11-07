/**
 * Borra SOLO los lotes indicados (y lo que ellos crearon). Nunca "todo".
 *   npx tsx scripts/limpiar-lotes.ts <idLote> [<idLote> …]
 */
import { cargarEntorno } from "./lib/entorno";
import { limpiarLote } from "./lib/limpiar";

async function main(): Promise<void> {
  cargarEntorno();
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.log("Uso: npx tsx scripts/limpiar-lotes.ts <idLote> [<idLote> …]");
    process.exitCode = 1;
    return;
  }
  for (const id of ids) console.log(id, await limpiarLote(id));
}

main();
