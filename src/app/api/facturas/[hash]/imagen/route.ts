import sharp from "sharp";
import { exigirUsuario } from "@/lib/auth/sesion";
import { descargarArchivo } from "@/lib/almacen";
import { tipoPorFirma, TIPO_MIME } from "@/lib/imagen";
import type { Factura } from "@/lib/modelo/tipos";
import { refFactura } from "@/lib/procesamiento/guardar";

/**
 * Sirve la imagen original de una factura desde el bucket privado (solo a su dueño).
 * ?rotar=90|180|270 la devuelve girada (para leer las fotografiadas de lado); el original en
 * el almacén no se toca.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/facturas/[hash]/imagen">) {
  const u = await exigirUsuario(request);
  if (u instanceof Response) return u;
  const { hash } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return Response.json({ error: "No existe." }, { status: 404 });

  const rotarTxt = new URL(request.url).searchParams.get("rotar");
  const rotar = rotarTxt === null ? 0 : Number(rotarTxt);
  if (![0, 90, 180, 270].includes(rotar)) {
    return Response.json({ error: "Solo se puede girar 90, 180 o 270 grados." }, { status: 400 });
  }

  const snap = await refFactura(hash).get();
  const f = snap.data() as Factura | undefined;
  if (!f || f.uid !== u.uid) return Response.json({ error: "No existe." }, { status: 404 });

  let imagen = await descargarArchivo(f.rutaArchivo);
  let tipo = TIPO_MIME[tipoPorFirma(imagen) ?? "png"];
  if (rotar) {
    imagen = await sharp(imagen).rotate(rotar).png().toBuffer();
    tipo = "image/png";
  }
  return new Response(new Uint8Array(imagen), {
    headers: { "content-type": tipo, "cache-control": "private, max-age=300" },
  });
}
