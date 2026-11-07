# Operación (Fase D)

Estado al 2026-11-07. Lo marcado como **pendiente** necesita el despliegue en Vercel, que espera la confirmación del hosting por parte del profesor.

## 1. Variables de entorno

Son las mismas de `.env.example`. En Vercel van en **Production, Preview y Development**, y los valores se pegan **sin comillas**. Después de cambiarlas hay que hacer Redeploy.

| Variable | Dónde se usa |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET` | solo servidor (`src/lib/almacen.ts`) |
| `NEXT_PUBLIC_FIREBASE_*` (6) | navegador, solo Auth (públicas por diseño) |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | solo servidor |
| `USUARIOS_PERMITIDOS` | autorización: sin ella, nadie entra |

`GET /api/salud` (con sesión) lista los **nombres** de las variables que falten en el despliegue.

Historial de git revisado: `BEGIN PRIVATE KEY` y `sb_secret_` aparecen solo como los valores **falsos** de `.env.example` y en el texto de la guía.

## 2. Duración de las funciones (Vercel Hobby: máximo 300 s, 1 vCPU)

| Ruta | `maxDuration` | Por qué |
|---|---|---|
| `POST /api/procesos/[id]/lote` | 300 | reclama 4 archivos; a los 200 s devuelve los que falten |
| `POST /api/procesos/[id]/finalizar` | 300 | genera el Excel de hasta ~1000 filas |
| `POST /api/procesos/[id]/regenerar-excel` | 300 | igual que finalizar |
| `POST /api/procesos/[id]/iniciar` | 60 | lista el almacén y crea la cola |
| `POST /api/datos/borrar` | 300 | borra colecciones completas |

El tamaño de lote (4 archivos) y la concurrencia (3 llamadas) dan, medido **en local** (Windows, Node 24), unos 2,4 a 2,7 s por factura incluyendo los reintentos de OCR, es decir, como mucho unos 40 s por invocación de `/lote`. Eso deja mucho margen dentro de los 200 s de presupuesto. **Pendiente:** medirlo en Vercel.

## 3. Autenticación en producción

- `scripts/probar-auth.ts`: las **18** rutas de la API responden 401 sin sesión, una cookie inventada da 401, un correo no autorizado da 403 y un lote ajeno da 404 (ver `probar-http.ts`). Verificado en local con `next start`. **Pendiente:** repetirlo contra la URL desplegada.
- Reglas de Firestore en «denegar todo» (`firestore.rules`): `scripts/verificar-reglas.ts` da 8 de 8 accesos anónimos rechazados con 403.

## 4. Política de archivos del almacén (Supabase Storage)

- Cada lote guarda sus imágenes y su Excel bajo `procesos/<idLote>/`. Cada regeneración crea un Excel nuevo con la hora de Colombia en el nombre, así que **no se pisan**.
- **Decisión:** entre prácticas se usa **«Borrar todo»** (Métricas → Borrar todo… → escribir BORRAR). Borra los datos de Firestore y los archivos de `procesos/`. Para quitar un solo lote se usa `npx tsx scripts/limpiar-lotes.ts <idLote>`.
- **Espacio:** el plan gratuito de Supabase da 1 GB. Las 1000 facturas pesan unos 111 MB, y cada Excel de 100 facturas, unos 30 KB. Caben unas 8 subidas completas antes de llenar el espacio. Por eso se borra entre prácticas.
- Supabase **pausa** un proyecto gratuito tras una semana sin actividad. Si la app falla con errores de almacenamiento después de un tiempo sin uso, hay que reactivarlo en el panel de Supabase.

## 5. Cuota de Firestore (plan gratuito: 50 000 lecturas al día)

Estimado por factura procesada: ~5 lecturas y ~6 escrituras. Por tanto, **1000 facturas ≈ 5 000 lecturas y 6 000 escrituras**. Reprocesar la misma carpeta vuelve a leer, pero no escribe facturas nuevas.

| Acción | Costo aproximado |
|---|---|
| Panel de métricas | 1 lectura por lote + `count()` de clientes |
| Detalle de un lote | 1 lectura cada 4 s mientras procesa; la lista de facturas, ~2 por factura y una sola vez |
| Lista de revisión | 1 lectura por factura pendiente (tope de 200) |
| Corregir una factura | 4 lecturas (factura, índice nuevo, índice anterior, cliente) y 3 a 5 escrituras |
| Borrar todo, con 1000 facturas | ≈ 4 000 borrados + `count()` |

**Pendiente:** anotar el consumo real (lecturas, escrituras y borrados de Firestore; CPU activa de Vercel; espacio y egreso de Supabase) después de la corrida completa en producción.

## 6. Resultados medidos (en local)

- Extractor sobre 100 facturas del curso que no se usaron para desarrollar (de la 101 a la 200): **89 aceptadas y 11 a revisión**, 2,4 s por factura. Entre las de revisión hay casos deliberados: IVA que no es el 19 %, DV del cliente, total que no cuadra e imágenes giradas. Sin `verdad.json` no se pueden contar los errores que la validación no detecta.
- `probar-http` con 20 facturas: subida en 2,5 s; 18 aceptadas y 2 a revisión. La suma del Excel coincide con Firestore. El reproceso da 20 de 20 duplicadas y no cambia los conteos. La caída simulada se retoma sin duplicar.
- `probar-ui` con 20 facturas en 2 lotes: 62 s en total, retraso máximo del navegador de 16 ms y 0 errores de consola. Sin scroll horizontal a 390 px de ancho.

## 7. Enderezado automático de imágenes giradas (decisión del 2026-11-07)

Si la lectura original sale **ilegible** (1 campo clave o ninguno entre número, fecha, NIT, subtotal y total), el sistema prueba giros de 90°, 270° y 180°. Sigue con la orientación que mejor se lea, y el giro queda en `facturas.rotacionAplicada`, en el Excel y en la tabla del lote. Las imágenes derechas no pagan ningún costo extra. Una girada cuesta de 1 a 3 lecturas más, unos 3 a 8 s en local.

- **Se aparta de la guía.** La guía manda las 10 facturas giradas a propósito **siempre** a revisión. Por decisión del estudiante, ahora se enderezan y, si todo cuadra, quedan **aceptadas**. A revisión van las que de verdad necesitan a una persona, como las borrosas. Por eso la cifra de «como mínimo 40 en revisión» baja a unas 30.
- **Medido** con `scripts/probar-giro.ts`: 4 facturas de diseños distintos, giradas a propósito 90°, 180° y 270°. Las 12 se enderezaron, se aceptaron y conservaron su número. La factura 0189, girada de origen, ahora queda aceptada. La 0141 no estaba girada: su problema es de calidad y sigue en revisión.

## 8. Pendiente para cerrar la fase

1. Confirmar el hosting con el profesor. Si es Vercel: importar el repositorio, definir las variables (sección 1) y hacer push.
2. Contra la URL desplegada: `probar-auth`, `probar-http` con 20 facturas (esta es la verificación de la Fase 5: OCR dentro de la función) y revisar `GET /api/salud`.
3. Revisar los *runtime logs* de Vercel tras una corrida y anotar cualquier 504, 413 o 500, o los errores de cuota.
4. Aceptación final: procesar las 1000 facturas en producción. Entre aceptadas, revisión y errores deben sumar 1000. Después hay que revisar a mano las de revisión: «Clientes en la base» debe llegar a 850. Cada lote debe tener su Excel, y reprocesar no debe duplicar nada.
5. Probar tú mismo «Borrar todo» (ninguna prueba automática lo pulsa) y la interfaz en un teléfono.
