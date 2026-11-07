import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraer } from "./extractor";
import { camposLeidos, mejorLectura, pareceGirada } from "./orientacion";
import { validar } from "./validador";

const fixture = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n), "utf8");
const lectura = (texto: string, confianza = 80) => {
  const parcial = extraer(texto);
  return { parcial, motivos: validar(parcial), confianza };
};

// Texto REAL que devolvió tesseract con factura_0001 girada 90° (generado con
// scripts/probar-giro.ts --fixture): basura sin ningún campo reconocible.
const GIRADA = fixture("girada-90-0001.txt");

describe("orientación", () => {
  it("una factura derecha no parece girada, aunque tenga errores", () => {
    expect(pareceGirada(extraer(fixture("color-0001.txt")))).toBe(false);
    expect(pareceGirada(extraer(fixture("tabla-mala-0006.txt")))).toBe(false); // borrosa: va a revisión, pero no está girada
  });

  it("el texto de una imagen girada no tiene campos clave: se prueban giros", () => {
    const p = extraer(GIRADA);
    expect(camposLeidos(p)).toBeLessThanOrEqual(1);
    expect(pareceGirada(p)).toBe(true);
  });

  it("gana la lectura con menos motivos (la enderezada)", () => {
    const girada = lectura(GIRADA, 40);
    const derecha = lectura(fixture("color-0001.txt"), 85);
    expect(mejorLectura(girada, derecha)).toBe(derecha);
    expect(mejorLectura(derecha, girada)).toBe(derecha);
  });

  it("a igualdad de motivos gana la que leyó más campos y luego la de más confianza", () => {
    const a = lectura(GIRADA, 30);
    const b = lectura(GIRADA, 60);
    expect(mejorLectura(a, b)).toBe(b);
  });
});
