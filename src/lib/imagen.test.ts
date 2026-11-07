import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TAMANO_MAXIMO, tipoPorFirma, validarImagen } from "./imagen";
import { nombreLimpio, rutaImagen } from "./rutas";

const png = () => sharp({ create: { width: 20, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
const jpg = () => sharp({ create: { width: 20, height: 10, channels: 3, background: "#fff" } }).jpeg().toBuffer();

describe("tipo por firma", () => {
  it("reconoce PNG y JPEG por sus primeros bytes", async () => {
    expect(tipoPorFirma(await png())).toBe("png");
    expect(tipoPorFirma(await jpg())).toBe("jpg");
  });
  it("un texto con nombre .png no es una imagen", () => {
    expect(tipoPorFirma(Buffer.from("hola, soy un texto"))).toBeNull();
  });
});

describe("validarImagen", () => {
  it("acepta imágenes reales", async () => {
    expect(await validarImagen(await png())).toMatchObject({ ok: true, tipo: "png", ancho: 20, alto: 10 });
    expect(await validarImagen(await jpg())).toMatchObject({ ok: true, tipo: "jpg" });
  });
  it("rechaza texto (415), PNG dañado (415), vacío (415) y más de 4 MB (413)", async () => {
    expect(await validarImagen(Buffer.from("no soy una imagen"))).toMatchObject({ ok: false, estado: 415 });
    const danado = Buffer.concat([(await png()).subarray(0, 16), Buffer.alloc(100, 7)]);
    expect(await validarImagen(danado)).toMatchObject({ ok: false, estado: 415 });
    expect(await validarImagen(Buffer.alloc(0))).toMatchObject({ ok: false, estado: 415 });
    expect(await validarImagen(Buffer.alloc(TAMANO_MAXIMO + 1))).toMatchObject({ ok: false, estado: 413 });
  });
});

describe("rutas", () => {
  it("limpia el nombre y usa la extensión del tipo real", () => {
    expect(nombreLimpio("Factura Nº 1 (copia).PNG")).toBe("factura_n_1_copia");
    expect(rutaImagen("abc", 7, "carpeta/Señal.jpeg", "png")).toBe("procesos/abc/0007-senal.png");
  });
});
