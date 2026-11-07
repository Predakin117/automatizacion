/**
 * Fase 2: comprueba que las reglas de Firestore están cerradas.
 *   npx tsx scripts/verificar-reglas.ts
 * Hace peticiones ANÓNIMAS a la API REST de Firestore usando solo la apiKey pública
 * (lo mismo que podría hacer cualquiera que abra la app). Todas deben dar 403.
 */
import { cargarEntorno, requerir } from "./lib/entorno";

const COLECCIONES = ["clientes", "facturas", "procesos", "indices_numero"];

async function main(): Promise<void> {
  cargarEntorno();
  const proyecto = requerir("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const apiKey = requerir("NEXT_PUBLIC_FIREBASE_API_KEY");
  const base = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents`;

  let fallos = 0;
  for (const coleccion of COLECCIONES) {
    const url = `${base}/${coleccion}?key=${encodeURIComponent(apiKey)}`;
    const lectura = await fetch(url);
    const escritura = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { intruso: { stringValue: "anónimo" } } }),
    });
    for (const [op, r] of [["lectura", lectura], ["escritura", escritura]] as const) {
      const ok = r.status === 403;
      if (!ok) fallos++;
      console.log(`${ok ? "OK   " : "FALLA"} ${op.padEnd(9)} ${coleccion.padEnd(15)} → ${r.status}`);
    }
  }
  if (fallos > 0) {
    console.log(`\n${fallos} operación(es) anónimas NO fueron rechazadas: cierra las reglas (firestore.rules).`);
    process.exitCode = 1;
  } else {
    console.log("\nReglas cerradas: todo acceso anónimo recibe 403.");
  }
}

main();
