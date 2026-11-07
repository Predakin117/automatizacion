import { z } from "zod";
import { exigirUsuario } from "@/lib/auth/sesion";
import { borrarArchivos, listarCarpeta, listarSubcarpetas } from "@/lib/almacen";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

export const maxDuration = 300;

const Cuerpo = z.object({ confirmacion: z.literal("BORRAR"), forzar: z.boolean().optional() });

/**
 * «Borrar todo»: vacía facturas, índices, clientes, lotes (con su cola) y los archivos del
 * almacén, DE TODOS LOS USUARIOS. Irreversible y gasta el límite diario de borrados de
 * Firestore. Exige escribir BORRAR y se niega (409) si hay lotes procesándose, salvo `forzar`.
 * Ninguna prueba automática debe llamarla contra datos reales.
 */
export async function POST(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Escribe BORRAR para confirmar." }, { status: 400 });

  const f = db();
  const enCurso = await f.collection(COLECCIONES.procesos).where("estado", "==", "ejecutando").limit(1).get();
  if (!enCurso.empty && !cuerpo.data.forzar) {
    return Response.json({ error: "Hay lotes procesándose. Confirma de nuevo para borrarlos igualmente." }, { status: 409 });
  }

  const conteo: Record<string, number> = {};
  for (const nombre of [COLECCIONES.facturas, COLECCIONES.indicesNumero, COLECCIONES.clientes, COLECCIONES.procesos]) {
    const ref = f.collection(nombre);
    conteo[nombre] = (await ref.count().get()).data().count;
    // recursiveDelete también borra las subcolecciones (la cola de cada lote).
    await f.recursiveDelete(ref);
  }
  let archivos = 0;
  for (const carpeta of await listarSubcarpetas("procesos")) {
    archivos += await borrarArchivos(await listarCarpeta(carpeta));
  }
  return Response.json({ ok: true, borrados: { ...conteo, archivos } });
}
