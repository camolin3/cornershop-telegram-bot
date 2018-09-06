import { addDays, compareAsc, format, startOfWeek } from 'date-fns';
import TelegramBot from 'node-telegram-bot-api';
import { Dict, login, mergeOrdersInfo, Order, updatedOrderDatesAndComissions } from './scrapper';
import { UserStorage } from './usersStorage';
import { dateToText, validateEmail } from './utils';

const token = process.env.BOT_TOKEN;
export enum STATES {
  GREETING,
  ASK_EMAIL,
  ASK_PASS,
  ANSWER_QUERIES,
}
export interface UserState{
  state: STATES;
  metadata: Dict<any>;
}
interface HandleParams {
  chatId: number;
  text: string;
  state: UserState;
}
type HandleState = (params: HandleParams) => Promise<UserState> | UserState | undefined;

const bot = new TelegramBot(token, { polling: true, onlyFirstMatch: true });

bot.onText(/.*/, async (msg, match) => {
  const chatId = msg.chat.id;
  const state = await getStateFor(chatId);
  const allStatesHandlers: { [key in STATES]: HandleState } = {
    [STATES.GREETING]: onGreeting,
    [STATES.ASK_EMAIL]: onAskEmail,
    [STATES.ASK_PASS]: onAskPass,
    [STATES.ANSWER_QUERIES]: onAnswerQueries,
  };
  const msgHandler = allStatesHandlers[state.state];
  const text = match[0];
  const nextState = (await msgHandler({chatId, text, state})) || state;
  setStateFor(chatId, nextState);
});

async function onGreeting({chatId, state}: HandleParams) {
  const messages = [
    `Hola! Mi nombre es Shopper Bot 👩‍🎤, soy un bot para Cornershop que te ayuda a calcular cuánto has ganado en el último tiempo.`,
    `Para comenzar, necesito tus credenciales de Cornershop, las mismas que usas para la app y la página web.`,
    `Prometo usar tus datos sólo para entregarte información, y no las enviaré a nadie más. Ni siquiera las guardaré 🤐😇😉.`,
    `Dame tu email 📧.`,
  ];
  for (const message of messages) {
    await bot.sendMessage(chatId, message);
  }
  return {...state, state: STATES.ASK_EMAIL };
}

async function onAskEmail({chatId, text, state}: HandleParams) {
  if (!validateEmail(text)) {
    await bot.sendMessage(chatId, 'No parece un email válido. Dame tu email nuevamente.');
    return null;
  }
  state.metadata.email = text;
  await bot.sendMessage(chatId, 'Bien. Ahora, dame tu contraseña 🔑.');
  return { ...state, state: STATES.ASK_PASS };
}

async function onAskPass({ chatId, text, state }: HandleParams) {
  if (!text) {
    await bot.sendMessage(chatId, 'No parece una contraseña válida. Dame tu contraseña nuevamente.');
    return null;
  }
  await bot.sendMessage(chatId, 'Bien. Intentaré hacer login... ⏱');

  const cookies = await login(state.metadata.email, text);
  state.metadata.cookies = cookies;
  await bot.sendMessage(chatId, 'La clave funcionó! 😁');
  await bot.sendMessage(chatId, 'Buscando entre tus órdenes y comisiones... 🔎');

  state.metadata = { ...state.metadata, ...await updatedOrderDatesAndComissions(cookies) };
  await bot.sendMessage(chatId, 'Listo. Puedes preguntarme cuánto has ganado 🔮 \n/hoy \n/ayer \n/estaSemana o \n/semanaPasada');

  return { ...state, state: STATES.ANSWER_QUERIES };
}

async function onAnswerQueries({ chatId, text, state }: HandleParams) {
  const groupedByDate = await mergeOrdersInfo(state.metadata.orderDates, state.metadata.commissionDates);
  if (text.match(/\/hoy/)) {
    onTodayText(chatId, groupedByDate);
  } else
  if (text.match(/\/ayer/)) {
    onYesterdayText(chatId, groupedByDate);
  } else
  if (text.match(/\/estaSemana/)) {
    onWeekText(chatId, groupedByDate);
  } else
  if (text.match(/\/semanaPasada/)) {
    onLastWeekText(chatId, groupedByDate);
  }
  return null;
}

function onTodayText(chatId, groupedByDate: Dict<Dict<Order>>) {
  const today = dateToText(new Date());
  if (!(today in groupedByDate)) {
    bot.sendMessage(chatId, 'No has ganado nada hoy (todavía) 💪.');
    return;
  }
  const sum = Object.entries(groupedByDate[today]).reduce((acc, [, order]) => acc + order.amount, 0);
  bot.sendMessage(chatId, `Hoy has ganado ${formatMoney(sum)} 💵.`);
};

function onYesterdayText(chatId, groupedByDate: Dict<Dict<Order>>) {
  const yesterday = dateToText(addDays(new Date(), -1));
  if (!(yesterday in groupedByDate)) {
    bot.sendMessage(chatId, 'Al parecer ayer no trabajaste 🙄.');
    return;
  }
  const sum = Object.entries(groupedByDate[yesterday]).reduce((acc, [, order]) => acc + order.amount, 0);
  bot.sendMessage(chatId, `Ayer ganaste ${formatMoney(sum)} 💰.`);
}

function onWeekText(chatId, groupedByDate: Dict<Dict<Order>>) {
  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const endDate = new Date();
  const sum = getDates(startDate, endDate)
    .map(dateToText)
    .filter(day => day in groupedByDate)
    .map(day => Object.entries(groupedByDate[day]).reduce((acc, [, order]) => acc + order.amount, 0))
    .reduce((acc, day) => acc + day, 0);
  bot.sendMessage(chatId, `Esta semana has ganado ${formatMoney(sum)} 💰💰.`);
}

function onLastWeekText(chatId, groupedByDate: Dict<Dict<Order>>) {
  const startDate = startOfWeek(addDays(new Date(), -7), { weekStartsOn: 1 });
  const endDate = addDays(startDate, 6);
  const sum = getDates(startDate, endDate)
    .map(dateToText)
    .filter(day => day in groupedByDate)
    .map(day => Object.entries(groupedByDate[day]).reduce((acc, [, order]) => acc + order.amount, 0))
    .reduce((acc, day) => acc + day, 0);
  bot.sendMessage(chatId, `La semana pasada ganaste ${formatMoney(sum)} 💸.`);
}

function getDates(initial: Date, final: Date) {
  [initial, final] = [initial, final].sort(compareAsc);
  const excludingFinal = addDays(final, 1);

  const str = d => format(d, 'ddMMyyyy');
  const dates = [];
  let current = initial;
  while (str(current) !== str(excludingFinal)) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

const states: Dict<UserState> = {};
const us = new UserStorage();

async function getStateFor(chatId: number) {
  if (!(chatId in states)) {
    states[chatId] = await us.get(chatId);
  }
  return states[chatId];
}

async function setStateFor(chatId: number, {state, metadata}: UserState) {
  const oldState = await getStateFor(chatId);
  const newState = { state, metadata: { ...oldState.metadata, ...metadata } };
  states[chatId] = await us.set(chatId, newState);
  return newState;
}

function formatMoney(value: number) {
  return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
}
