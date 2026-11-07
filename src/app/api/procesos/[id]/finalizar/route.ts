import { exigirUsuario } from "@/lib/auth/sesion";
import { finalizarProceso } from "@/lib/procesamiento/finalizar";
import { noEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

/** Cierra el lote y genera su Excel. Idempotente: responde listo: false mientras falten archivos. */
export async function POST(request: Request, ctx: RouteContext<"/api/procesos/[id]/finalizar">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  if (p.estado === "subiendo") return Response.json({ listo: false, pendientes: p.totalArchivos });
  return Response.json(await finalizarProceso(id));
}
