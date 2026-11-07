import { calcularDv } from "./nit";
import type { ItemLeido, ParcialFactura } from "./tipos";

/**
 * extraer(textoOcr) → ParcialFactura. Función PURA: sin OCR ni base de datos, por eso se
 * prueba con textos reales guardados en __fixtures__. Lo que no encuentra queda en null.
 *
 * Funciona con los 4 diseños del curso (encabezado de color, clásico con tabla, ticket y
 * caja con borde doble). Cada regla viene de un error real del OCR; ver extractor.test.ts.
 */

// ───────────────────────── normalización ─────────────────────────

/** Arregla los errores de OCR más comunes en importes, antes de interpretar nada. */
export function normalizarLinea(linea: string): string {
  let s = linea.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  s = s.replace(/(\d) \.(\d{3})/g, "$1.$2"); // "$496 .000" → "$496.000"
  s = s.replace(/(\d)\. (\d{3})\b/g, "$1.$2"); // "$496. 000" → "$496.000"
  // "S146.500" / "s10500": la S es un "$" mal leído (solo si va seguida de un importe).
  s = s.replace(/(^|[\s|(\[!])[Ss](?=\d{1,3}(?:\.\d{3})+\b|\d{4,}\b)/g, "$1$");
  s = s.replace(/(\d)\$/g, "$1 $"); // "3$146.500" → "3 $146.500"
  s = s.replace(/\$ (?=\d)/g, "$"); // "$ 1.000" → "$1.000"
  return s;
}

export function lineasDe(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map(normalizarLinea)
    .filter((l) => l.length > 0);
}

// ───────────────────────── importes ─────────────────────────

/** Quita porcentajes ("19%", "(19%)", "4 %") para que no se confundan con importes. */
function sinPorcentajes(linea: string): string {
  return linea.replace(/\(?\b\d{1,2}(?:[.,]\d+)?\s?%\)?/g, " ");
}

interface Importe {
  valor: number | null; // null si el token está dañado ("$621.4572")
  inicio: number;
  fin: number;
}

/** Importes "$1.234.567" (punto de miles, sin decimales). También "$2514900" sin puntos. */
export function importesEn(linea: string): Importe[] {
  const s = sinPorcentajes(linea);
  const r: Importe[] = [];
  for (const m of s.matchAll(/\$(\d[\d.,]*\d|\d)/g)) {
    const token = m[1];
    let valor: number | null = null;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(token)) valor = Number(token.replace(/[.,]/g, ""));
    else if (/^\d+$/.test(token)) valor = Number(token);
    r.push({ valor, inicio: m.index, fin: m.index + m[0].length });
  }
  return r;
}

function ultimoImporte(linea: string): number | null {
  const imps = importesEn(linea);
  return imps.length > 0 ? imps[imps.length - 1].valor : null;
}

// ───────────────────────── fechas ─────────────────────────

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (a < 2000 || a > 2100 || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface FechaEncontrada {
  fecha: string;
  inicio: number;
}

/** Reconoce dd/mm/yyyy, yyyy-mm-dd y "12 de marzo de 2026"; descarta fechas imposibles. */
export function fechasEn(linea: string): FechaEncontrada[] {
  const r: FechaEncontrada[] = [];
  for (const m of linea.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const f = fechaValida(Number(m[3]), Number(m[2]), Number(m[1]));
    if (f) r.push({ fecha: f, inicio: m.index });
  }
  for (const m of linea.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const f = fechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
    if (f) r.push({ fecha: f, inicio: m.index });
  }
  for (const m of linea.matchAll(/\b(\d{1,2}) de ([a-záéíóú]+) (?:de|del) (\d{4})\b/gi)) {
    const mes = MESES[m[2].toLowerCase()];
    const f = mes ? fechaValida(Number(m[3]), mes, Number(m[1])) : null;
    if (f) r.push({ fecha: f, inicio: m.index });
  }
  return r.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Fecha de EMISIÓN. La factura trae otras (vencimiento, resolución DIAN, autorización):
 * se descartan las precedidas por esas palabras y las de líneas de resolución.
 */
function extraerFecha(lineas: string[]): string | null {
  const RE_LINEA_EXCLUIDA = /resoluci|autoriz|\bres\.|\bpref|rango/i;
  const RE_PREVIO_EXCLUIDO = /venc|l[ií]mite|resoluci|autoriz/i;
  const RE_ETIQUETA = /emisi[oó]n|expedici[oó]n|fecha/i;
  let respaldo: string | null = null;
  for (const linea of lineas) {
    let desde = 0;
    for (const f of fechasEn(linea)) {
      const previo = linea.slice(desde, f.inicio);
      desde = f.inicio + 1;
      if (RE_PREVIO_EXCLUIDO.test(previo)) continue;
      if (RE_ETIQUETA.test(previo)) return f.fecha; // "Emisión: …", "Fecha: …"
      if (!RE_LINEA_EXCLUIDA.test(linea) && !respaldo) respaldo = f.fecha;
    }
  }
  return respaldo;
}

// ───────────────────────── número de factura ─────────────────────────

function extraerNumero(lineas: string[]): string | null {
  for (const linea of lineas) {
    // Ignora "rango del FE-000001 al FE-050000" y las líneas de resolución/autorización.
    if (/rango|resoluci|autoriz|\bal FE/i.test(linea)) continue;
    const m = /\bFE\s?-\s?([0-9OoIl]{6})\b/.exec(linea);
    if (m) return `FE-${m[1].replace(/[Oo]/g, "0").replace(/[Il]/g, "1")}`;
  }
  return null;
}

// ───────────────────────── documentos (NIT / CC) ─────────────────────────

interface Documento {
  numero: string; // sin puntos, guion ni DV
  dv: number;
}

const RE_ETIQUETA_DOC = /\b(nit|documento|c\.?\s?c\.?)\b/i;

/** NIT con o sin puntos y con DV: "900.123.456-7", "900123456-7". */
export function documentosEn(linea: string): Documento[] {
  const r: Documento[] = [];
  for (const m of linea.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d{3}){2,3}|\d{6,10}) ?- ?(\d)(?!\d)/g)) {
    r.push({ numero: m[1].replace(/\./g, ""), dv: Number(m[2]) });
  }
  // El OCR a veces pierde el guion ("8726212069"): solo se acepta si la línea tiene
  // etiqueta de documento Y el último dígito ES un DV válido del número anterior.
  if (r.length === 0 && RE_ETIQUETA_DOC.test(linea)) {
    for (const m of linea.matchAll(/(?<![\d.-])(\d{7,11})(?![\d-])/g)) {
      const numero = m[1].slice(0, -1);
      const dv = Number(m[1].slice(-1));
      if (calcularDv(numero) === dv) r.push({ numero, dv });
    }
  }
  return r;
}

// "Monitor" contiene "nit": por eso las etiquetas usan límites de palabra (\b).
const RE_ETIQUETA_CLIENTE = /\b(cliente|adquirente|se[ñn]ores)\b/i;

// ───────────────────────── razón social ─────────────────────────

const RE_TITULO = /\bFACTURA(?:\s+DE\s+VENTA)?\s+ELECTR[ÓO]NICA(?:\s+DE(?:\s+VENTA)?)?\b|\bDE\s+VENTA\b|^\s*VENTA\b|\bVENTA\s*$/gi;
const RE_SUFIJO = /(?:[S5]\.\s?A\.\s?S\.?|\bSAS\b|[S5]\.\s?A\.(?!\s?S)|\bLtda\.?|\bLTDA\.?|\bE\.\s?U\.)/;

function letras(s: string): number {
  return (s.match(/[A-Za-zÁÉÍÓÚÑáéíóúñÜü]/g) ?? []).length;
}

function limpiarNombre(s: string): string {
  return s
    .replace(RE_TITULO, " ")
    .replace(/\s+-\s+Responsable de IVA.*$/i, "")
    .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/, "") // basura inicial del OCR ("+ O ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Corta en el sufijo societario (S.A.S., S.A., Ltda., E.U.). */
function cortarEnSufijo(s: string): { nombre: string; soloSufijo: boolean } | null {
  const m = RE_SUFIJO.exec(s);
  if (!m) return null;
  const nombre = s.slice(0, m.index + m[0].length).trim();
  return { nombre, soloSufijo: letras(s.slice(0, m.index)) < 3 };
}

/** La razón social está en la(s) línea(s) justo antes de la del NIT del proveedor. */
function extraerProveedor(lineas: string[], idxNit: number): string | null {
  for (let k = 1; k <= 3 && idxNit - k >= 0; k++) {
    const candidata = limpiarNombre(lineas[idxNit - k]);
    const corte = cortarEnSufijo(candidata);
    if (!corte) continue;
    if (!corte.soloSufijo) return corte.nombre;
    // Solo quedó el sufijo: la razón social venía PARTIDA en dos líneas (a veces con el
    // título de la factura intercalado): se antepone la línea anterior.
    const anterior = idxNit - k - 1 >= 0 ? limpiarNombre(lineas[idxNit - k - 1]) : "";
    if (letras(anterior) >= 3) return `${anterior} ${corte.nombre}`.replace(/\s+/g, " ").trim();
  }
  // Sin sufijo: la línea anterior, si parece texto.
  const previa = idxNit > 0 ? limpiarNombre(lineas[idxNit - 1]) : "";
  return letras(previa) >= 6 && !/\d{3}/.test(previa) ? previa : null;
}

/** Nombre del cliente: el texto de la etiqueta hasta la línea de su documento. */
function extraerNombreCliente(lineas: string[], idxEtiqueta: number, idxDoc: number): string | null {
  const cortar = (s: string) =>
    s
      .replace(/\b(NIT\/CC|NIT|Documento|C\.C\.|Emisi[oó]n|Fecha)\b.*$/i, "")
      .replace(/DATOS DE LA FACTURA/i, "")
      .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ.]+$/g, "")
      .trim();
  const partes: string[] = [];
  const etiqueta = lineas[idxEtiqueta];
  const m = RE_ETIQUETA_CLIENTE.exec(etiqueta);
  partes.push(cortar(m ? etiqueta.slice(m.index + m[0].length).replace(/^\s*:/, "") : ""));
  for (let i = idxEtiqueta + 1; i <= idxDoc && i < lineas.length; i++) partes.push(cortar(lineas[i]));
  const nombre = partes.filter((p) => letras(p) >= 2).join(" ").replace(/\s+/g, " ").trim();
  return letras(nombre) >= 3 ? nombre : null;
}

// ───────────────────────── ítems ─────────────────────────

const RE_LINEA_SUBTOTAL = /valor antes de iva|\bsubtotal\b|base gravable/i;

/** Cantidades candidatas: "23 x $…", el número pegado al precio, o el inicio de la línea. */
function cantidadesCandidatas(antesDelPrecio: string): number[] {
  const r: number[] = [];
  const x = /(\d{1,4})\s*[xX×]\s*$/.exec(antesDelPrecio);
  if (x) r.push(Number(x[1]));
  const pegado = /(?:^|[\s|!\]])(\d{1,4})\s*[|!\]]*\s*$/.exec(antesDelPrecio);
  if (pegado) r.push(Number(pegado[1]));
  const inicio = /^\W*(\d{1,4})\b/.exec(antesDelPrecio);
  if (inicio) r.push(Number(inicio[1]));
  return r.filter((n) => n > 0);
}

function limpiarDescripcion(s: string, cantidad: number | null = null): string {
  let r = s
    .replace(/\$\S*/g, " ")
    .replace(/[|[\]!_—–=]+/g, " ")
    .replace(/^\W*\d{1,4}\b\s*/, "") // índice o cantidad al inicio
    .replace(/\s+/g, " ")
    .trim();
  // El número del final solo se quita si ERA la cantidad ("… de 4 puntos" lo conserva).
  const final = /\s(\d{1,4})\s*[xX×]?$/.exec(r);
  if (final && cantidad !== null && Number(final[1]) === cantidad) r = r.slice(0, final.index);
  return r
    .replace(/\s[xX×]\s*$/, "")
    .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9".)]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Es texto de descripción (y no basura del OCR ni un encabezado)? */
function esTextoDescriptivo(linea: string): boolean {
  if (/descripci[oó]n|\bcant\.|precio|v\. unitario/i.test(linea)) return false;
  const l = letras(linea);
  return l >= 3 && l / linea.replace(/\s/g, "").length >= 0.6;
}

function leerItems(lineas: string[], desde: number, hasta: number): ItemLeido[] {
  const items: ItemLeido[] = [];
  let pendiente: string[] = []; // líneas de texto sin importes (descripciones partidas)
  for (let i = desde; i < hasta; i++) {
    const linea = lineas[i];
    const imps = importesEn(linea);
    if (imps.length < 2) {
      if (documentosEn(linea).length > 0 || RE_ETIQUETA_CLIENTE.test(linea) || /\b(fecha|vence|pago|medio)\b/i.test(linea)) {
        pendiente = []; // un dato de cabecera corta cualquier descripción en curso
      } else if (esTextoDescriptivo(linea)) {
        pendiente.push(limpiarDescripcion(linea));
      }
      continue;
    }
    const precio = imps[imps.length - 2];
    const sub = imps[imps.length - 1];
    // Una dirección leída como ítem ("Cra 115 $ 48-7"): precio mínimo de $100.
    if (precio.valor !== null && precio.valor < 100) continue;

    const antes = sinPorcentajes(linea.slice(0, precio.inicio)).trimEnd();
    const p = precio.valor;
    const s = sub.valor;
    let cantidad: number | null = null;
    const candidatas = cantidadesCandidatas(antes);
    if (p !== null && s !== null) {
      cantidad = candidatas.find((c) => c * p === s) ?? null;
      // Reparación por redundancia aritmética: la cantidad se perdió o se leyó mal, pero
      // subtotal / precio es un entero pequeño: esa es la cantidad.
      if (cantidad === null && p > 0 && s % p === 0 && s / p <= 9999) cantidad = s / p;
    }
    if (cantidad === null) cantidad = candidatas[0] ?? null;

    const propia = limpiarDescripcion(antes, cantidad);
    let descripcion: string;
    if (letras(propia) < 4) {
      descripcion = pendiente.join(" "); // diseño ticket: la descripción va ANTES
    } else {
      if (items.length > 0 && pendiente.length > 0) {
        items[items.length - 1].descripcion += " " + pendiente.join(" "); // continuación del anterior
      }
      descripcion = propia;
    }
    pendiente = [];
    items.push({ descripcion: descripcion.trim(), cantidad, precioUnitario: p, subtotal: s });
  }
  if (items.length > 0 && pendiente.length > 0) items[items.length - 1].descripcion += " " + pendiente.join(" ");
  return items;
}

// ───────────────────────── extractor ─────────────────────────

export function extraer(texto: string): ParcialFactura {
  const lineas = lineasDe(texto);

  // Totales: desde la primera línea de subtotal QUE TENGA importe (el encabezado de la tabla
  // "Cant. Descripción Precio unitario Subtotal" no tiene).
  let idxTotales = lineas.findIndex((l) => RE_LINEA_SUBTOTAL.test(l) && importesEn(l).length > 0);
  if (idxTotales < 0) idxTotales = lineas.length;

  // Documentos: proveedor antes de la etiqueta del cliente; cliente en ella o hasta 3 después.
  const docs = lineas.map(documentosEn);
  const idxCliente = lineas.findIndex((l, i) => i < idxTotales && RE_ETIQUETA_CLIENTE.test(l));
  let idxNitProv = -1;
  let idxDocCliente = -1;
  const limiteProv = idxCliente >= 0 ? idxCliente : idxTotales;
  for (let i = 0; i < limiteProv; i++) {
    if (docs[i].length > 0) {
      idxNitProv = i;
      break;
    }
  }
  if (idxCliente >= 0) {
    for (let i = idxCliente; i <= idxCliente + 3 && i < idxTotales; i++) {
      if (docs[i].length > 0) {
        idxDocCliente = i;
        break;
      }
    }
  } else {
    for (let i = idxNitProv + 1; i < idxTotales; i++) {
      if (i > 0 && docs[i].length > 0) {
        idxDocCliente = i;
        break;
      }
    }
  }
  const prov = idxNitProv >= 0 ? docs[idxNitProv][0] : null;
  // En la línea del adquirente puede haber un solo documento; si no hubiera etiqueta, el segundo.
  const cli = idxDocCliente >= 0 ? docs[idxDocCliente][0] : null;

  const idxProvParaNombre =
    idxNitProv >= 0 ? idxNitProv : lineas.findIndex((l, i) => i < limiteProv && /\bNIT\b/i.test(l));

  // Ítems: entre el documento del cliente y los totales.
  const inicioItems = idxDocCliente >= 0 ? idxDocCliente + 1 : idxCliente >= 0 ? idxCliente + 1 : 0;
  const items = leerItems(lineas, inicioItems, idxTotales);

  // Totales
  const zona = lineas.slice(idxTotales);
  const subtotal = zona.length > 0 ? (importesEn(zona[0])[0]?.valor ?? null) : null;
  // IVA: la línea EMPIEZA por "IVA" ("Responsable de IVA" no cuenta; "IVA19%" sí).
  const lineaIva = zona.find((l) => /^\W*I\.?V\.?A/i.test(l) && importesEn(l).length > 0);
  // Impoconsumo: "consumo" o "INC" ("Impresora" empieza por "Imp" y NO es impoconsumo).
  const lineaInc = zona.find((l) => /consumo|\bINC\b/i.test(l) && importesEn(l).length > 0);
  const lineasTotal = zona.filter((l) => /\btotal\b/i.test(l) && importesEn(l).length > 0);

  return {
    numero: extraerNumero(lineas),
    fecha: extraerFecha(lineas),
    proveedor: idxProvParaNombre >= 0 ? extraerProveedor(lineas, idxProvParaNombre) : null,
    nitProveedor: prov?.numero ?? null,
    dvProveedor: prov?.dv ?? null,
    clienteDocumento: cli?.numero ?? null,
    clienteDv: cli?.dv ?? null,
    clienteNombre: idxCliente >= 0 ? extraerNombreCliente(lineas, idxCliente, Math.max(idxCliente, idxDocCliente)) : null,
    items,
    subtotal,
    iva: lineaIva ? ultimoImporte(lineaIva) : null,
    impoconsumo: lineaInc ? ultimoImporte(lineaInc) : null,
    mencionaImpoconsumo: zona.some((l) => /consumo|\bINC\b/i.test(l)),
    total: lineasTotal.length > 0 ? ultimoImporte(lineasTotal[lineasTotal.length - 1]) : null,
  };
}
