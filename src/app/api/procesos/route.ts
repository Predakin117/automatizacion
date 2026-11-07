import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { exigirUsuario } from "@/lib/auth/sesion";
import { db } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { resumenProceso } from "@/lib/procesamiento/proceso";

/** Lista los lotes del usuario. ?estado=ejecutando para que el Motor retome los que quedaron a medias. */
export async function GET(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;

  const estado = new URL(request.url).searchParams.get("estado");
  let consulta = db().collection(COLECCIONES.procesos).where("uid", "==", u.uid);
  // Dos filtros de igualdad no necesitan índice compuesto; el orden se hace en memoria.
  if (estado === "ejecutando" || estado === "terminado" || estado === "subiendo") {
    consulta = consulta.where("estado", "==", estado);
  }
  const snap = await consulta.get();
  const procesos = snap.docs
    .map((d) => resumenProceso(d.id, d.data() as Proceso))
    .sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));
  return Response.json({ procesos });
}

const Nuevo = z.object({
  carpeta: z.string().trim().min(1).max(200),
  totalArchivos: z.number().int().min(1).max(5000),
});

/** Crea un lote vacío (estado "subiendo"). Las imágenes se suben después, una por petición. */
export async function POST(request: Request) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const cuerpo = Nuevo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Datos del lote inválidos." }, { status: 400 });

  const proceso: Proceso = {
    uid: u.uid,
    carpeta: cuerpo.data.carpeta,
    estado: "subiendo",
    totalArchivos: cuerpo.data.totalArchivos,
    inicio: Timestamp.now(),
    fin: null,
    rutaExcel: null,
    finalizandoDesde: null,
  };
  const ref = await db().collection(COLECCIONES.procesos).add(proceso);
  return Response.json({ id: ref.id }, { status: 201 });
}
