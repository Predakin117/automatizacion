import { describe, expect, it } from "vitest";
import { calcularDv, dvValido } from "./nit";

describe("dígito de verificación (DIAN)", () => {
  it("calcula los casos comprobados", () => {
    expect(calcularDv("890903938")).toBe(8);
    expect(calcularDv("860034313")).toBe(7);
    expect(calcularDv("899999068")).toBe(1);
  });

  it("ignora puntos y valida NIT reales de las facturas del curso", () => {
    expect(calcularDv("836.531.588")).toBe(1);
    expect(dvValido("856162509", 7)).toBe(true);
    expect(dvValido("856162509", 6)).toBe(false);
  });

  it("detecta un dígito mal leído (casi siempre: no es garantía)", () => {
    expect(dvValido("856162508", 7)).toBe(false);
  });

  it("rechaza vacíos y longitudes imposibles", () => {
    expect(calcularDv("")).toBeNull();
    expect(dvValido(null, 1)).toBe(false);
    expect(calcularDv("1".repeat(16))).toBeNull();
  });
});
