import { FieldValue } from "firebase-admin/firestore";

// A Firestore document holds 1 MiB. This leaves room for the other fields.
const MAX_RECORD_BYTES = 1_000_000;

/**
 * Keeps each record as one document with its value as JSON text, so the
 * household is saved exactly as the single-computer build writes it to disk.
 * Record keys are document paths: households/<id>, households/<id>/photos/<id>,
 * accounts/<uid> and invites/<code>.
 */
export function firestoreStore(db) {
  return {
    transaction(run) {
      return db.runTransaction((transaction) => run({
        async get(key) {
          const snapshot = await transaction.get(db.doc(key));
          return snapshot.exists ? JSON.parse(snapshot.get("json")) : null;
        },
        set(key, value) {
          const json = JSON.stringify(value);
          if (Buffer.byteLength(json) > MAX_RECORD_BYTES) {
            throw Object.assign(new Error("There’s more history here than this test server can keep. Tell whoever runs the test."), { status: 507 });
          }
          transaction.set(db.doc(key), { json, updatedAt: FieldValue.serverTimestamp() });
        },
        delete(key) {
          transaction.delete(db.doc(key));
        },
      }));
    },
  };
}
