import { test, expect } from '@playwright/test';
import { createServer } from '../src/mock-server';

let server: any;

const agentId = 'acme';
const pointId = '00001';
const basePath = `/partner/payout/v1/agents/${agentId}/points/${pointId}`;
const authHeader = { Authorization: 'Bearer test-token' };
const jsonHeaders = { Accept: 'application/json', ...authHeader };

// Тестовые данные и хелперы
const BASE_URL = 'http://localhost:3000';
const makePaymentId = () => 'test-pay-' + Date.now();
const makeMissingPaymentId = () => 'missing-' + Date.now();

const headersValid = jsonHeaders;
const headersNoAuth = { Accept: 'application/json' };
const headersNoAccept = { ...authHeader };
const headersWrongAuth = { Accept: 'application/json', Authorization: 'test-token' }; // нет схемы Bearer
const headersXmlAccept = { Accept: 'application/xml', ...authHeader };

const validPaymentPayload = {
  recipientDetails: { providerCode: 'qiwi-wallet', fields: { account: '79123456789' } },
  amount: { value: '1.00', currency: 'RUB' },
  source: {
    paymentType: 'NO_EXTRA_CHARGE',
    paymentToolType: 'BANK_ACCOUNT',
    paymentTerminalType: 'INTERNET_BANKING',
  },
};

function parseMoney(v: any): number {
  if (!v) return NaN;
  const value = typeof v.value === 'string' ? v.value : String(v.value ?? '');
  return parseFloat(value.replace(',', '.'));
}

test.beforeAll(async () => {
  // Запуск мок-сервера в процессе перед всеми тестами
  const created = createServer();
  server = created.server;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// 1) Доступ сервиса и проверка формата через метод «Получить все платежи»
test('Доступ сервиса и проверка формата: список платежей возвращает массив объектов PaymentInfo', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/payments`, { headers: headersValid });
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('application/json');
  const data = await res.json();
  expect(Array.isArray(data)).toBeTruthy();
  // Если пусто — это всё равно массив
  if (data.length > 0) {
    const p = data[0];
    expect(p).toHaveProperty('paymentId');
    expect(p).toHaveProperty('status');
    expect(p.status).toHaveProperty('value');
    expect(p).toHaveProperty('amount');
    expect(p.amount).toHaveProperty('value');
    expect(p.amount).toHaveProperty('currency');
  }
});

// 2) Запрос баланса (условие: доступный баланс > 0)
test('Баланс доступен и больше 0', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/balance`, { headers: headersValid });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('available');
  const available = parseMoney(body.available);
  expect(available).toBeGreaterThan(0);
});

// 3) Создание платежа на 1 рубль
test('Создание платежа на 1 рубль -> READY', async ({ request }) => {
  const paymentId = makePaymentId();
  const res = await request.put(`${BASE_URL}${basePath}/payments/${paymentId}`, {
    headers: { ...headersValid, 'Content-Type': 'application/json' },
    data: validPaymentPayload,
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.paymentId).toBe(paymentId);
  expect(body.status.value).toBe('READY');
  expect(body.amount.value).toBe('1.00');
  expect(body.amount.currency).toBe('RUB');
});

// 4) Исполнение платежа -> COMPLETED
test('Исполнение платежа -> COMPLETED', async ({ request }) => {
  const paymentId = makePaymentId();
  // Сначала создаём платёж
  await request.put(`${BASE_URL}${basePath}/payments/${paymentId}`, {
    headers: { ...headersValid, 'Content-Type': 'application/json' },
    data: validPaymentPayload,
  });
  // Затем исполняем
  const execRes = await request.post(`${BASE_URL}${basePath}/payments/${paymentId}/execute`, { headers: headersValid });
  expect(execRes.ok()).toBeTruthy();
  const execBody = await execRes.json();
  expect(execBody.paymentId).toBe(paymentId);
  expect(execBody.status.value).toBe('COMPLETED');
});

// 5) Негативный: отсутствие Authorization -> 401
test('401 при отсутствии Authorization', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/payments`, { headers: headersNoAuth });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.errorCode).toBe('UNAUTHORIZED');
});

// 6) Негативный: отсутствие Accept -> 406
test('406 при отсутствии Accept: application/json', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/payments`, { headers: headersNoAccept });
  expect(res.status()).toBe(406);
  const body = await res.json();
  expect(body.errorCode).toBe('NOT_ACCEPTABLE');
});

// 7) Негативный: execute несуществующего платежа -> 404
test('404 при исполнении несуществующего платежа', async ({ request }) => {
  const paymentId = makeMissingPaymentId();
  const res = await request.post(`${BASE_URL}${basePath}/payments/${paymentId}/execute`, { headers: headersValid });
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.errorCode).toBe('PAYMENT_NOT_FOUND');
});

// 8) Негативный: неверный формат Authorization (без Bearer) -> 401
test('401 при неверном формате Authorization (без Bearer)', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/payments`, { headers: headersWrongAuth });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.errorCode).toBe('UNAUTHORIZED');
});

// 9) Негативный: неприемлемый Accept (application/xml) -> 406
test('406 при Accept: application/xml', async ({ request }) => {
  const res = await request.get(`${BASE_URL}${basePath}/payments`, { headers: headersXmlAccept });
  expect(res.status()).toBe(406);
  const body = await res.json();
  expect(body.errorCode).toBe('NOT_ACCEPTABLE');
});

// 10) Негативный: создание платежа без Authorization -> 401
test('401 при создании платежа без Authorization', async ({ request }) => {
  const paymentId = makePaymentId();
  const res = await request.put(`${BASE_URL}${basePath}/payments/${paymentId}`, {
    headers: { ...headersNoAuth, 'Content-Type': 'application/json' },
    data: validPaymentPayload,
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.errorCode).toBe('UNAUTHORIZED');
});
