import * as admin from 'firebase-admin';
import * as serviceAccount from '../serviceAccountKey.json';

export class UserStorage {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    admin.initializeApp({
      credential: true
        ? admin.credential.cert(serviceAccount as admin.ServiceAccount)
        : admin.credential.applicationDefault()
    });

    this.db = admin.firestore();
  }

  public async get(chatId: number) {
    const doc = await this.db.doc(`users/${chatId}`).get();
    if (!doc.exists) {
      return {};
    }
    return doc.data();
  }

  public set(chatId: number, value: object) {
    return this.db.doc(`users/${chatId}`).set(value);
  }
}
