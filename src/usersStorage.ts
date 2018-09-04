import * as admin from 'firebase-admin';
import { STATES, UserState } from '.';
import * as serviceAccount from './serviceAccountKey.json';

export class UserStorage {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    admin.initializeApp({
      credential: true
        ? admin.credential.cert(serviceAccount as admin.ServiceAccount)
        : admin.credential.applicationDefault()
    });

    this.db = admin.firestore();
    const settings = { timestampsInSnapshots: true };
    this.db.settings(settings);
  }

  public async get(chatId: number) {
    const doc = await this.db.doc(`users/${chatId}`).get();
    if (!doc.exists) {
      return this.set(chatId, { metadata: {}, state: STATES.GREETING });
    }
    return doc.data() as UserState;
  }

  public async set(chatId: number, value: UserState) {
    await this.db.doc(`users/${chatId}`).set(value);
    return value;
  }
}
