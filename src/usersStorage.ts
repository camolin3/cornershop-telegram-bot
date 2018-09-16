import * as admin from 'firebase-admin';
import * as serviceAccount from './serviceAccountKey.json';
import { STATES, UserState } from './types';

export class UserStorage {
  public get defaultValue(): UserState {
    return {
      metadata: {
        lastUpdatedAt: new Date(0).toISOString(),
        ordersWithCommission: [],
        ordersWithDate: [],
      },
      state: STATES.GREETING,
    };
  }
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
      return this.set(chatId, this.defaultValue);
    }
    return doc.data() as UserState;
  }

  public async set(chatId: number, value: UserState) {
    await this.db.doc(`users/${chatId}`).set(value);
    return value;
  }

  public async remove(chatId: number) {
    return this.db.doc(`users/${chatId}`).delete();
  }
}
