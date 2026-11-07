/**
 * Fase 9: prueba de integración (Firestore real) de la revisión manual.
 *   npx tsx scripts/probar-correccion.ts
 * Crea un lote de prueba con facturas en revisión (datos sintéticos, números FE-9xxxxx que
 * no chocan con el conjunto del curso), ejercita corregirFactura y limpia SOLO lo que creó.
 */
import { randomBytes, randomInt } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../src/lib/firebase/admin";
import { COLECCIONES, type Cliente, type Factura, type IndiceNumero, type Proceso } from "../src/lib/modelo/tipos";
import { calcularDv } from "../src/lib/ocr/nit";
import { proponerTotales, type DatosFactura } from "../src/lib/procesamiento/correccion";
import { corregirFactura } from "../src/lib/procesamiento/corregir";
import { normalizarMetricas } from "../src/lib/procesamiento/metricas";
import { cargarEntorno } from "./lib/entorno";
import { limpiarLote } from "./lib/limpiar";

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ""): void {
  if (!ok) fallos++;
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${detalle ? " → " + detalle : ""}`);
}

const documento = () => String(randomInt(800_000_000, 899_999_999));
const numero = () => `FE-9${String(randomInt(0, 99_999)).padStart(5, "0")}`;

function datosValidos(): DatosFactura {
  const items = [{ descripcion: "Monitor LED 24 pulgadas", cantidad: 2, precioUnitario: 500_000 }];
  const doc = documento();
  const nit = documento();
  return {
    numero: numero(),
    fecha: "2026-03-05",
    proveedor: "Proveedor de Prueba S.A.S.",
    nitProveedor: nit,
    dvProveedor: calcularDv(nit)!,
    clienteDocumento: doc,
    clienteDv: calcularDv(doc)!,
    clienteNombre: "Cliente de Prueba S.A.S.",
    items,
    ...proponerTotales(items, false),
  };
}

async function main(): Promise<void> {
  cargarEntorno();
  const f = db();
  const usuario = { uid: `prueba-correccion`, email: "prueba@ejemplo.com" };
  const proceso: Proceso = {
    uid: usuario.uid, carpeta: "prueba-correccion", estado: "terminado", totalArchivos: 4,
    inicio: Timestamp.now(), fin: Timestamp.now(), rutaExcel: null, finalizandoDesde: null,
  };
  const lote = await f.collection(COLECCIONES.procesos).add(proceso);
  const facturaEn = (estado: "revision" | "aceptada", uid = usuario.uid): Factura => ({
    numero: null, fecha: null, proveedor: null, nitProveedor: null, dvProveedor: null, clienteDocumento: null,
    clienteDocumentoLeido: null, clienteDv: null, clienteNombre: null, subtotal: null, iva: null, impoconsumo: null,
    total: 999, estado, motivos: ["El total no cuadra (prueba)"], archivo: "prueba.png", rutaArchivo: "procesos/x/prueba.png",
    confianzaOcr: 50, procesoId: lote.id, uid, creadoEn: Timestamp.now(), items: [],
  });
  const nuevaFactura = async (estado: "revision" | "aceptada" = "revision", uid?: string) => {
    const hash = randomBytes(32).toString("hex");
    await f.collection(COLECCIONES.facturas).doc(hash).set(facturaEn(estado, uid));
    return hash;
  };
  const leer = async (hash: string) => (await f.collection(COLECCIONES.facturas).doc(hash).get()).data() as Factura;
  const metricas = async () => normalizarMetricas(((await lote.get()).data() as Proceso).metricas);

  try {
    // 1. Validación que rechaza (422) sin escribir nada.
    const h1 = await nuevaFactura();
    const d1 = datosValidos();
    const r1 = await corregirFactura(h1, usuario, { ...d1, total: d1.total + 1000 }, false);
    comprobar("total que no cuadra sin confirmar → 422", !r1.ok && r1.estado === 422);
    comprobar("…y no escribe nada", (await leer(h1)).estado === "revision" && !(await f.collection(COLECCIONES.indicesNumero).doc(d1.numero).get()).exists);

    // 2. DV del cliente equivocado: bloquea aunque se confirme.
    const r2 = await corregirFactura(h1, usuario, { ...d1, clienteDv: (d1.clienteDv + 1) % 10 }, true);
    comprobar("DV del cliente equivocado → 422 aunque se confirme", !r2.ok && r2.estado === 422);

    // 3. Guardado con todos sus efectos.
    const r3 = await corregirFactura(h1, usuario, d1, false);
    const g = await leer(h1);
    comprobar("guardado correcto", r3.ok && r3.clienteNuevo);
    comprobar("factura aceptada con constancia", g.estado === "aceptada" && g.corregidaManualmente === true && g.corregidaPor === usuario.email && (g.motivosOriginales ?? []).length === 1);
    const indice = (await f.collection(COLECCIONES.indicesNumero).doc(d1.numero).get()).data() as IndiceNumero | undefined;
    comprobar("índice del número creado", indice?.hashArchivo === h1);
    const cliente = (await f.collection(COLECCIONES.clientes).doc(d1.clienteDocumento).get()).data() as Cliente | undefined;
    comprobar("cliente creado por este lote", cliente?.primerProcesoId === lote.id && cliente.nombre === d1.clienteNombre);
    let m = await metricas();
    comprobar("contadores: manuales", m.manuales.n === 1 && m.manuales.total === d1.total && m.clientesNuevos === 1, JSON.stringify(m.manuales));
    comprobar("contadores: proveedor", m.proveedores[d1.nitProveedor]?.n === 1);
    comprobar("contadores: «correctas» no cambia", m.aceptadas.n === 0);

    // 4. Reedición: solo la diferencia.
    const items = [{ descripcion: "Monitor LED 24 pulgadas", cantidad: 3, precioUnitario: 500_000 }];
    const d4 = { ...d1, items, ...proponerTotales(items, false) };
    const r4 = await corregirFactura(h1, usuario, d4, false);
    m = await metricas();
    comprobar("reedición guardada", r4.ok && !r4.clienteNuevo);
    comprobar("reedición: aplica solo la diferencia", m.manuales.n === 1 && m.manuales.total === d4.total, `${m.manuales.total} vs ${d4.total}`);
    comprobar("reedición: conserva los motivos originales", ((await leer(h1)).motivosOriginales ?? []).length === 1);

    // 5. Cambio de número: libera el índice anterior.
    const d5 = { ...d4, numero: numero() };
    await corregirFactura(h1, usuario, d5, false);
    const viejo = await f.collection(COLECCIONES.indicesNumero).doc(d1.numero).get();
    const nuevo = await f.collection(COLECCIONES.indicesNumero).doc(d5.numero).get();
    comprobar("cambio de número: libera el anterior y crea el nuevo", !viejo.exists && (nuevo.data() as IndiceNumero)?.hashArchivo === h1);

    // 6. Número repetido en otra factura → 409.
    const h6 = await nuevaFactura();
    const r6 = await corregirFactura(h6, usuario, { ...datosValidos(), numero: d5.numero }, false);
    comprobar("número que ya existe en otra factura → 409", !r6.ok && r6.estado === 409);

    // 7. Factura ya aceptada por la máquina → 409.
    const h7 = await nuevaFactura("aceptada");
    const r7 = await corregirFactura(h7, usuario, datosValidos(), false);
    comprobar("factura aceptada por la máquina → 409", !r7.ok && r7.estado === 409);

    // 8. Ajena o inexistente → 404.
    const h8 = await nuevaFactura("revision", "otro-usuario");
    const r8 = await corregirFactura(h8, usuario, datosValidos(), false);
    comprobar("factura de otro usuario → 404", !r8.ok && r8.estado === 404);
    const r8b = await corregirFactura(randomBytes(32).toString("hex"), usuario, datosValidos(), false);
    comprobar("factura inexistente → 404", !r8b.ok && r8b.estado === 404);

    // 9. Confirmar una incoherencia real (IVA al 5 %): se guarda y queda constancia.
    const d9 = datosValidos();
    const r9 = await corregirFactura(h6, usuario, { ...d9, iva: Math.round(d9.subtotal * 0.05), total: d9.subtotal + Math.round(d9.subtotal * 0.05) }, true);
    const g9 = await leer(h6);
    comprobar("IVA distinto confirmado: se guarda con validacionesIgnoradas", r9.ok && (g9.validacionesIgnoradas ?? []).some((v) => v.includes("IVA")));
    m = await metricas();
    comprobar("contadores finales", m.manuales.n === 2 && m.clientesNuevos === 2, `manuales ${m.manuales.n}, clientes nuevos ${m.clientesNuevos}`);
  } finally {
    console.log("limpieza:", JSON.stringify(await limpiarLote(lote.id)));
  }
  console.log(fallos === 0 ? "\nTodo OK." : `\n${fallos} comprobación(es) fallaron.`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
