export enum STATES {
  GREETING,
  ASK_EMAIL,
  ASK_PASS,
  ANSWER_QUERIES,
}
export interface UserState {
  state: STATES;
  metadata: {
    lastUpdatedAt: string,
    ordersWithCommission: OrderWithCommission[],
    ordersWithDate: OrderWithDate[],
  } & Dict<any>;
}
export interface HandleParams {
  chatId: number;
  text: string;
  state: UserState;
}
export type HandleState = (params: HandleParams) => Promise<UserState> | UserState | undefined;
export interface Order {
  id: string;
  date: Date;
  amount: number;
}
export interface Dict<T> { [id: string]: T }
export interface OrderWithDate {
  id: string,
  date: string,
}
export interface OrderWithCommission {
  id: string,
  amount: number,
  paymentDate: string,
}
