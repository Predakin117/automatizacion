import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * firebase-admin SOLO en el servidor. La cuenta de servicio se salta las reglas de
 * Firestore (por eso las reglas están en "denegar todo": nadie más entra).
 * Se inicializa una sola vez por instancia: en una función caliente de Vercel el módulo
 * se reutiliza entre invocaciones y crear la app dos veces daría error.
 */

function requerir(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  // El error menciona solo el nombre, nunca el valor.
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

function app(): App {
  const existente = getApps()[0];
  if (existente) return existente;
  return initializeApp({
    credential: cert({
      projectId: requerir("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requerir("FIREBASE_ADMIN_CLIENT_EMAIL"),
      // En Vercel la clave llega con "\n" literales; reemplazarlos cubre los dos casos.
      privateKey: requerir("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(app());
    // Un campo `undefined` haría fallar la escritura; preferimos que se omita.
    // settings() solo puede llamarse una vez, antes de cualquier operación.
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function auth(): Auth {
  return getAuth(app());
}
