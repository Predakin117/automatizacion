# Procesador de facturas

Clase «Tendencias en desarrollo de software», tema **automatización**. Lee facturas electrónicas colombianas (imágenes) con OCR, valida sus datos, los guarda en Firestore y genera un Excel por lote. Lo que la máquina no puede aceptar va a **revisión manual**.

- **Next.js 16** (App Router), desplegable en **Vercel** (plan Hobby).
- **Firebase**: Firestore (datos, solo desde el servidor) y Authentication (correo y contraseña).
- **Supabase Storage** (bucket privado) para las imágenes y los Excel. Reemplaza a Vercel Blob por decisión del profesor.
- **tesseract.js** (OCR), **sharp**, **exceljs**, **zod**.

La guía paso a paso está en [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md). La operación (cuotas, archivos y despliegue) está en [docs/operacion.md](docs/operacion.md).

## Empezar

```bash
npm install
cp .env.example .env              # y rellena los valores (nunca los subas a Git)
npx tsx scripts/probar-conexion.ts # Firestore OK, Auth OK, Storage OK
npm run dev
```

## Comprobaciones

| Comando | Qué demuestra |
|---|---|
| `npm run lint` · `npx tsc --noEmit` · `npm test` | antes de cada commit (35 pruebas unitarias) |
| `npx tsx scripts/verificar-reglas.ts` | las reglas de Firestore niegan todo acceso anónimo |
| `npx tsx scripts/probar-auth.ts <url>` | todas las rutas exigen sesión; 403 para correos no autorizados |
| `npx tsx scripts/leer-carpeta.ts <imágenes> [verdad.json] --desde N --cantidad N` | mide el extractor sin base de datos |
| `npx tsx scripts/probar-http.ts <url> <imágenes> [cantidad]` | subida validada, cola, lotes concurrentes, Excel, reproceso idempotente y caída simulada |
| `npx tsx scripts/probar-ui.ts <url> <imágenes> <porLote> <capturas>` | interfaz con navegador real (Edge instalado) |
| `npx tsx scripts/probar-correccion.ts` | transacción de la revisión manual contra Firestore |
| `npx tsx scripts/probar-revision-ui.ts <url> <imágenes> <capturas>` | revisión manual con navegador real |
| `npx tsx scripts/limpiar-lotes.ts <idLote> …` | borra **solo** los lotes indicados |

Las pruebas que escriben en Firestore o en el almacén **limpian solo lo que crearon**. Ninguna pulsa «Borrar todo».
