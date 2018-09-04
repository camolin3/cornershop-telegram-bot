import puppeteer from 'puppeteer';
import { dateToText } from './utils';

export interface Order {
  id: string;
  date: Date;
  amount: number;
}
export interface Dict<T> { [id: string]: T }
type OrderWithDate = ReturnType<typeof handleOrdersWithDate>;
type OrderWithCommission = ReturnType<typeof handleOrdersWithCommission>;

const browserPromise = puppeteer.launch({ headless: false });

async function getPage(cookies: puppeteer.SetCookie[] = []) {
  const browser = await browserPromise;
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  await page.setCookie(...cookies);
  return page;
}

export async function login(email: string, password: string) {
  const page = await getPage();
  const loginUrl = 'https://cornershopapp.com/accounts/login/?next=/shoppercenter/';
  await page.goto(loginUrl, { waitUntil: 'networkidle2' });
  await page.type('#email', email);
  await page.type('#password', password);
  await page.click('form [type=submit]');
  await page.waitFor('.img-circle');
  setTimeout(() => page.close(), 10000);
  return page.cookies();
}

export async function updatedOrderDatesAndComissions(cookies) {
  const [datesInfo, amounInfo] = await Promise.all([
    getOrdersWithDate(cookies),
    getOrdersWithCommission(cookies),
  ]);

  const orders: Dict<Order> = datesInfo
    .map(({ id, date }) => [id, new Date(date), 0] as [string, Date, number])
    .reduce((acc, [id, date, amount]) => {
      acc[id] = { id, date, amount };
      return acc;
    }, {});
  amounInfo.reduce((acc, { id, amount }) => {
    if (id in acc) {
      acc[id].amount += amount;
    }
    return acc;
  }, orders);

  const grouped: Dict<Dict<Order>> = Object.entries(orders)
    .reduce((acc, [id, order]) => {
      const date = dateToText(order.date);
      if (!(date in acc)) {
        acc[date] = {};
      }
      acc[date][id] = order;
      return acc;
    }, {});
  return grouped;
}

export async function getOrdersWithDate(cookies) {
  const page = await getPage(cookies);
  const ordersUrl = 'https://cornershopapp.com/shoppercenter/orders';
  await page.goto(ordersUrl);
  const result = await page.evaluate(handleOrdersWithDate);
  page.close();
  return result as OrderWithDate;
}

export async function getOrdersWithCommission(cookies) {
  const page = await getPage(cookies);
  const commissionsUrl = 'https://cornershopapp.com/shoppercenter/commissions';
  await page.goto(commissionsUrl);

  const result = [];
  const nextPageLinkSelector = ':not(.disabled) > a[aria-label=Next]';
  const seenDates = new Set<string>();
  do {
    const orderList: OrderWithCommission = await page.evaluate(handleOrdersWithCommission);
    result.push(...orderList);

    orderList.map(o => o.paymentDate)
      .forEach(date => seenDates.add(date))

    if (await page.$(nextPageLinkSelector) === null) {
      break;
    }
    const navigation = page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.click(nextPageLinkSelector);
    await navigation;
  } while (seenDates.size <= 2)
  page.close();
  return result as OrderWithCommission;
}

export function handleOrdersWithDate() {
  const monthsArray = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const cellValue = (tr, i = 0): string => tr.querySelector(`td:nth-child(${i + 1})`).innerText;
  const strToDate = (dateText: string) => {
    const [year, month, day] = dateText.replace(/(\d+)-(\w+)-(\d+).*/, '$3-$2-$1').split('-');
    const mIndex = monthsArray.indexOf(month);
    const date = new Date(Number(year), mIndex, Number(day));
    return isNaN(date.getDate()) ? null : date.toLocaleDateString();
  };
  const getDate = tr => strToDate(cellValue(tr, 2));

  const initialArray = Array.from(document.querySelectorAll('table tbody tr'))
    .map(tr => [cellValue(tr), getDate(tr)]);

  let row: number;
  // tslint:disable-next-line no-conditional-assignment
  while ((row = initialArray.findIndex(([_, date]) => !date)) !== -1) {
    initialArray[row][1] = (row === 0 && initialArray.length) ?
      initialArray[row + 1][1] : initialArray[row - 1][1];
  }

  return initialArray.map(([id, date]) => ({ id, date }));
}

export function handleOrdersWithCommission() {
  const monthsArray = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const cellValue = (tr, i = 0): string => tr.querySelector(`td:nth-child(${i + 1})`).innerText;
  const cleanNumber = (str: string) => +str.replace(/\D/gi, '');
  const getAmount = tr => cleanNumber(cellValue(tr, 3));
  const strToDate = (dateText: string) => {
    const [year, month, day] = dateText.replace(/(\d+)-(\w+)-(\d+).*/, '$3-$2-$1').split('-');
    const mIndex = monthsArray.indexOf(month);
    const date = new Date(Number(year), mIndex, Number(day));
    return isNaN(date.getDate()) ? null : date.toLocaleDateString();
  };
  const getPaymentDate = tr => strToDate(cellValue(tr, 2));

  return Array.from(document.querySelector('table').querySelectorAll('tbody tr'))
    .map(tr => [cellValue(tr), getAmount(tr), getPaymentDate(tr)] as [string, number, string])
    .map(([id, amount, paymentDate]) => ({ id, amount, paymentDate }));
}
