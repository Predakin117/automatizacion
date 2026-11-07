import { describe, expect, it } from "vitest";
import { calcularTasas, cambiosDe, metricasDesdeEventos, proveedoresOrdenados, sumarMetricas, type EventoMetrica } from "./metricas";

const imp = (subtotal: number) => ({
  subtotal,
  iva: Math.round(subtotal * 0.19),
  impoconsumo: null,
  total: subtotal + Math.round(subtotal * 0.19),
});

describe("cambiosDe", () => {
  it("una aceptada suma importes, proveedor y cliente nuevo", () => {
    const c = cambiosDe({ tipo: "aceptada", importes: imp(100), proveedor: { nit: "900", nombre: "A S.A.S." }, cliente: "nuevo" });
    expect(c.incrementos).toEqual({ "aceptadas.n": 1, "aceptadas.subtotal": 100, "aceptadas.iva": 19, "aceptadas.total": 119, clientesNuevos: 1 });
    expect(c.proveedores["900"]).toMatchObject({ nombre: "A S.A.S.", incrementos: { n: 1, total: 119 } });
  });

  it("una de revisión NO suma al proveedor (el NIT puede estar mal leído)", () => {
    const c = cambiosDe({ tipo: "revision", importes: { subtotal: null, iva: null, impoconsumo: null, total: 50 } });
    expect(c.incrementos).toEqual({ "revision.n": 1, "revision.total": 50 });
    expect(c.proveedores).toEqual({});
  });

  it("una reedición manual suma solo la diferencia", () => {
    const c = cambiosDe({
      tipo: "manual",
      importes: imp(300),
      antes: imp(100),
      proveedor: { nit: "900", nombre: "A" },
      proveedorAntes: { nit: "900" },
      cliente: null,
    });
    expect(c.incrementos["manuales.n"]).toBeUndefined(); // -1 + 1 = 0
    expect(c.incrementos["manuales.subtotal"]).toBe(200);
    expect(c.proveedores["900"].incrementos).toMatchObject({ n: 0, subtotal: 200 });
  });
});

describe("tasas y sumas", () => {
  const eventos: EventoMetrica[] = [
    { tipo: "aceptada", importes: imp(100), proveedor: { nit: "1", nombre: "Uno" }, cliente: "nuevo" },
    { tipo: "aceptada", importes: imp(300), proveedor: { nit: "2", nombre: "Dos" }, cliente: "existente" },
    { tipo: "aceptada", importes: imp(100), proveedor: { nit: "1", nombre: "Uno" }, cliente: "existente" },
    { tipo: "revision", importes: imp(10) },
    { tipo: "error" },
    { tipo: "duplicada" },
  ];
  const m = metricasDesdeEventos(eventos);

  it("las duplicadas no cuentan en los porcentajes; las manuales no son «correctas»", () => {
    const t = calcularTasas(m);
    expect(t).toMatchObject({ procesadas: 5, correctas: 3, malLeidas: 2, pctCorrectas: 60, pctMalLeidas: 40 });
    const conManual = metricasDesdeEventos([
      ...eventos,
      { tipo: "manual", importes: imp(10), antes: null, proveedor: null, proveedorAntes: null, cliente: null },
    ]);
    const t2 = calcularTasas(conManual);
    expect(t2.correctas).toBe(3);
    expect(t2.revisadasAMano).toBe(1);
    expect(t2.pendientesDeRevision).toBe(1);
    expect(t2.procesado.subtotal).toBe(510);
  });

  it("suma lotes y ordena proveedores por total", () => {
    const s = sumarMetricas([m, m]);
    expect(s.aceptadas.n).toBe(6);
    expect(s.clientesNuevos).toBe(2);
    expect(proveedoresOrdenados(s).map((p) => p.nit)).toEqual(["2", "1"]);
  });
});
