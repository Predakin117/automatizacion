import { exigirUsuario } from "@/lib/auth/sesion";
import { procesarLote } from "@/lib/procesamiento/lote";
import { noEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

// Máximo de Vercel Hobby. El lote se autolimita a 200 s y devuelve lo que falte.
export const maxDuration = 300;

/** Reclama y procesa hasta 4 archivos. El Motor del navegador llama a esta ruta 3 veces en paralelo. */
export async function POST(request: Request, ctx: RouteContext<"/api/procesos/[id]/lote">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  if (p.estado !== "ejecutando") return Response.json({ reclamados: 0, estado: p.estado });
  return Response.json(await procesarLote(id, u.uid));
}
