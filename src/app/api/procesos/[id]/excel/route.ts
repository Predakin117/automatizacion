import { exigirUsuario } from "@/lib/auth/sesion";
import { descargarArchivo } from "@/lib/almacen";
import { TIPO_XLSX } from "@/lib/excel/generar";
import { noEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

/** El bucket es privado: el servidor lee el Excel y lo entrega como descarga. */
export async function GET(request: Request, ctx: RouteContext<"/api/procesos/[id]/excel">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const p = await procesoDelUsuario(id, u.uid);
  if (!p) return noEncontrado();
  if (!p.rutaExcel) return Response.json({ error: "El lote aún no tiene Excel." }, { status: 404 });
  const contenido = await descargarArchivo(p.rutaExcel);
  const nombre = p.rutaExcel.split("/").pop() ?? "resultado.xlsx";
  return new Response(new Uint8Array(contenido), {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "private, no-store",
    },
  });
}
