import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentosEn, extraer, fechasEn, importesEn, normalizarLinea } from "./extractor";
import { validar } from "./validador";

const fixture = (nombre: string) => readFileSync(path.join(__dirname, "__fixtures__", nombre), "utf8");

// ───────────────── textos reales de los 4 diseños ─────────────────

describe("diseño con encabezado de color", () => {
  const p = extraer(fixture("color-0001.txt"));
  it("lee cabecera, cliente, ítems y totales", () => {
    expect(p).toMatchObject({
      numero: "FE-000833",
      fecha: "2026-10-16",
      proveedor: "Infotec Rico Rubio S.A.",
      nitProveedor: "856162509",
      dvProveedor: 7,
      clienteDocumento: "869745262",
      clienteDv: 3,
      clienteNombre: "Inversiones Rangel Batista S.A.S.",
      subtotal: 5457000,
      iva: 1036830,
      impoconsumo: null,
      total: 6493830,
    });
    expect(p.items).toHaveLength(2);
    // La descripción partida en dos líneas se une al ítem anterior.
    expect(p.items[1].descripcion).toContain("monocromática con red");
    expect(validar(p)).toEqual([]);
  });

  it("si el NIT del encabezado es ilegible, va a revisión; el modo encabezado lo recupera", () => {
    const solo = extraer(fixture("color-nit-ilegible-0003.txt"));
    expect(validar(solo)).toContain("No se leyó el NIT del proveedor");
    const combinado = extraer(`${fixture("color-encabezado-0003.txt")}\n${fixture("color-nit-ilegible-0003.txt")}`);
    expect(combinado.nitProveedor).toBe("880877724");
    expect(validar(combinado)).toEqual([]);
  });
});

describe("diseño clásico con tabla", () => {
  it("lee la factura y repara cantidades que el OCR perdió", () => {
    const p = extraer(fixture("tabla-0002.txt"));
    expect(p).toMatchObject({
      numero: "FE-000906",
      fecha: "2026-09-13", // no la de la resolución (11/01/2026) ni la de vencimiento
      proveedor: "Servicios Profesionales Arce Gallegos S.A.S.",
      nitProveedor: "836531588",
      clienteDocumento: "879905239",
      clienteNombre: "Comercializadora Palacios Orta S.A.S.",
      total: 5317039,
    });
    // "Asesoría contable por horas $215.400 $1.077.000": sin cantidad → 1.077.000 / 215.400 = 5
    expect(p.items[0]).toMatchObject({ cantidad: 5, precioUnitario: 215400, subtotal: 1077000 });
    expect(validar(p)).toEqual([]);
  });

  it("razón social partida en dos líneas con el título intercalado", () => {
    // "Materiales y Construcciones Ocasio Arriaga FACTURA ELECTRÓNICA DE" / "S.A.S. VENTA"
    const p = extraer(fixture("tabla-razon-partida-0012.txt"));
    expect(p.proveedor).toBe("Materiales y Construcciones Ocasio Arriaga S.A.S.");
    expect(validar(p)).toEqual([]);
  });

  it("documento del cliente sin guion: se acepta solo si el último dígito es un DV válido", () => {
    const p = extraer(fixture("tabla-mala-0006.txt"));
    expect(p.clienteDocumento).toBe("872621206"); // "NIT/CC: 8726212069"
    expect(p.clienteDv).toBe(9);
    // "NA 19%": la etiqueta del IVA ilegible → revisión, nunca se inventa el valor.
    expect(p.iva).toBeNull();
    expect(validar(p)).toContain("No se leyó el IVA");
  });
});

describe("diseño ticket", () => {
  it("razón social partida, cliente en dos líneas y descripción ANTES de los importes", () => {
    const p = extraer(fixture("ticket-0005.txt"));
    expect(p).toMatchObject({
      numero: "FE-000826",
      fecha: "2026-02-26", // no "28 de enero de 2026 Pref. FE" (resolución)
      proveedor: "ASESORÍAS INTEGRALES LEDESMA ALANIS S.A.S.",
      clienteNombre: "Homero Alaníz Regalado Cabrera Riojas",
      clienteDocumento: "868577354",
    });
    expect(p.items[0]).toMatchObject({
      descripcion: "Instalación y configuración de red estructurada, por punto",
      cantidad: 23,
      precioUnitario: 114800,
      subtotal: 2640400,
    });
    expect(validar(p)).toEqual([]);
  });
});

describe("diseño caja con borde doble (con impoconsumo)", () => {
  it("lee el impoconsumo y la fecha de expedición (no la fecha límite)", () => {
    const p = extraer(fixture("borde-impoconsumo-0008.txt"));
    expect(p).toMatchObject({
      numero: "FE-000655",
      fecha: "2026-05-30",
      proveedor: "COMUNICACIONES MÓVILES PONCE ROSAS S.A.",
      clienteNombre: "Agroindustrias Montemayor Muñiz S.A.S.",
      subtotal: 2130900,
      iva: 404871,
      impoconsumo: 85236, // "Imp. consumo 4 %"
      mencionaImpoconsumo: true,
      total: 2621007,
    });
    // "UA" en lugar de la cantidad: 1.009.400 / 144.200 = 7
    expect(p.items[3].cantidad).toBe(7);
    expect(validar(p)).toEqual([]);
  });
});

// ───────────────── lecciones (cada una salió de un error real) ─────────────────

/** Una factura mínima válida en la que se cambia una línea. */
function factura(cambios: Partial<Record<"cabecera" | "items" | "totales", string>> = {}): string {
  return [
    cambios.cabecera ??
      "Ferretería Prueba S.A.S.\nNIT: 890.903.938-8 No. FE-000123\nFecha de emisión: 05/03/2026\nAdquirente: Cliente Uno S.A.S. NIT/CC: 860.034.313-7",
    cambios.items ?? "2 Monitor LED 24 pulgadas $100.000 $200.000",
    cambios.totales ?? "Subtotal $200.000\nIVA 19% $38.000\nTOTAL $238.000",
  ].join("\n");
}

describe("lecciones", () => {
  it("la factura base es válida", () => {
    expect(validar(extraer(factura()))).toEqual([]);
  });

  it('"Monitor" contiene "nit": no es una etiqueta de documento', () => {
    expect(documentosEn("2 Monitor 123456789 $1.000 $2.000")).toEqual([]);
    expect(extraer(factura()).items[0].descripcion).toBe("Monitor LED 24 pulgadas");
  });

  it('"Impresora" empieza por "Imp" pero no es impoconsumo', () => {
    const p = extraer(factura({ items: "1 Impresora láser $200.000 $200.000" }));
    expect(p.impoconsumo).toBeNull();
    expect(p.mencionaImpoconsumo).toBe(false);
    expect(validar(p)).toEqual([]);
  });

  it('"Responsable de IVA" no es la línea del IVA', () => {
    const p = extraer(factura({ totales: "Subtotal $200.000\nResponsable de IVA $1.000\nIVA 19% $38.000\nTOTAL $238.000" }));
    expect(p.iva).toBe(38000);
  });

  it("etiquetas pegadas por el OCR: IVA19% e Imp. consumo 4 %", () => {
    const p = extraer(
      factura({ totales: "Base gravable $200.000\nIVA19% $38.000\nImp. consumo 4 % $8.000\nVALOR TOTAL $246.000" }),
    );
    expect(p).toMatchObject({ subtotal: 200000, iva: 38000, impoconsumo: 8000, total: 246000 });
    expect(validar(p)).toEqual([]);
  });

  it("menciona impoconsumo pero no se lee su valor → revisión", () => {
    const p = extraer(factura({ totales: "Subtotal $200.000\nIVA 19% $38.000\nImpoconsumo 4% ilegible\nTOTAL $246.000" }));
    expect(validar(p)).toContain("La factura menciona impoconsumo pero no se pudo leer su valor");
  });

  it("fechas y cifras largas que no son lo buscado (vencimiento, resolución, rango, CUFE)", () => {
    const texto = factura({
      cabecera: [
        "Ferretería Prueba S.A.S.",
        "NIT: 890.903.938-8",
        "Resolución DIAN No. 18764125519785 del 11/01/2026. Prefijo FE, rango del FE-000001 al FE-005000.",
        "Fecha de vencimiento: 30/04/2026 Fecha de emisión: 05/03/2026",
        "No. FE-000123",
        "Adquirente: Cliente Uno S.A.S. NIT/CC: 860.034.313-7",
      ].join("\n"),
      totales: "Subtotal $200.000\nIVA 19% $38.000\nTOTAL $238.000\nCUFE: 5636d2f9daab2cdf9f3171bfc8c9bbf2400b000193",
    });
    const p = extraer(texto);
    expect(p.fecha).toBe("2026-03-05");
    expect(p.numero).toBe("FE-000123");
    expect(p.nitProveedor).toBe("890903938");
    expect(validar(p)).toEqual([]);
  });

  it("reconoce los tres formatos de fecha y descarta fechas imposibles", () => {
    expect(fechasEn("12 de marzo de 2026")[0].fecha).toBe("2026-03-12");
    expect(fechasEn("2026-01-30")[0].fecha).toBe("2026-01-30");
    expect(fechasEn("31/02/2026")).toEqual([]);
  });

  it("una dirección no se lee como ítem", () => {
    const p = extraer(factura({ items: "Cra 115 $ 48-7 $12\n2 Monitor LED 24 pulgadas $100.000 $200.000" }));
    expect(p.items).toHaveLength(1);
  });

  it("una cantidad mal leída se repara con la aritmética", () => {
    // El OCR leyó "7" en lugar de "2": 200.000 / 100.000 = 2
    const p = extraer(factura({ items: "7 Monitor LED 24 pulgadas $100.000 $200.000" }));
    expect(p.items[0].cantidad).toBe(2);
    expect(validar(p)).toEqual([]);
  });

  it("normaliza importes dañados por el OCR", () => {
    expect(normalizarLinea("Valor $496 .000")).toBe("Valor $496.000");
    expect(normalizarLinea("3$146.500")).toBe("3 $146.500");
    expect(normalizarLinea("Precio S146.500")).toBe("Precio $146.500");
    expect(importesEn("IVA (19%) $1.036.830").map((i) => i.valor)).toEqual([1036830]);
    expect(importesEn("NA 19% $621.4572").map((i) => i.valor)).toEqual([null]); // dañado: no se adivina
  });

  it("nunca inventa: un texto vacío deja todo en null y con motivos", () => {
    const p = extraer("");
    expect(p.numero).toBeNull();
    expect(p.total).toBeNull();
    expect(validar(p).length).toBeGreaterThan(5);
  });
});

describe("validador", () => {
  it("detecta IVA que no es el 19 %, total que no cuadra y DV del cliente equivocado", () => {
    const iva5 = extraer(factura({ totales: "Subtotal $200.000\nIVA $10.000\nTOTAL $210.000" }));
    expect(validar(iva5)).toContain("El IVA no es el 19 % del valor antes de IVA");

    const total = extraer(factura({ totales: "Subtotal $200.000\nIVA 19% $38.000\nTOTAL $260.000" }));
    expect(validar(total)).toContain("El total no cuadra (valor antes de IVA + IVA + impoconsumo)");

    const dv = extraer(
      factura({
        cabecera:
          "Ferretería Prueba S.A.S.\nNIT: 890.903.938-8 No. FE-000123\nFecha de emisión: 05/03/2026\nAdquirente: Cliente Uno S.A.S. NIT/CC: 860.034.313-2",
      }),
    );
    expect(validar(dv)).toContain("El dígito de verificación del documento del cliente no es válido");
  });

  it("los ítems deben sumar el valor antes de IVA", () => {
    const p = extraer(
      factura({ items: "2 Monitor LED $100.000 $200.000\n1 Teclado mecánico $50.000 $50.000" }),
    );
    expect(validar(p)).toContain("Los ítems no suman el valor antes de IVA");
  });
});
