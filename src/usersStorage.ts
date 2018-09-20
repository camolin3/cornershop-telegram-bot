import * as admin from 'firebase-admin';
import { STATES, UserState } from './types';
import { isCloudEngine } from './utils';

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
    this.setFirebase();
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

  private async setFirebase() {
    admin.initializeApp({
      credential: isCloudEngine()
        ? admin.credential.applicationDefault()
        : admin.credential.cert((await import('./serviceAccountKey')).default as admin.ServiceAccount)
    });

    this.db = admin.firestore();
    const settings = { timestampsInSnapshots: true };
    this.db.settings(settings);
  }
}
