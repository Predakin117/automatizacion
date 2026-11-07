import { exigirUsuario } from "@/lib/auth/sesion";
import { escribirExcel } from "@/lib/procesamiento/finalizar";
import { noEncontrado, procesoDelUsuario, refProceso } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

/** El Excel es una foto del momento en que terminó el lote: esto lo genera de nuevo desde la base. */
export async function POST(request: Request, ctx: RouteContext<"/api/procesos/[id]/regenerar-excel">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  if (p.estado !== "terminado") return Response.json({ error: "El lote aún no termina." }, { status: 409 });
  const rutaExcel = await escribirExcel(id, p);
  await refProceso(id).update({ rutaExcel });
  return Response.json({ rutaExcel });
}
