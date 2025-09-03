const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Память процесса для хранения платежей (упрощённо, без базы данных)
const payments = new Map();

function makeMoney(value, currency = 'RUB') {
  return { value: typeof value === 'number' ? value.toFixed(2) : value, currency };
}

function nowIso() {
  return new Date().toISOString();
}

function requireHeaders(req, res) {
  // Минимальная проверка заголовков, чтобы тесты доступности были осмысленными
  const accept = req.get('Accept');
  const auth = req.get('Authorization');
  if (!accept || !/application\/json/i.test(accept)) {
    return res.status(406).json({ errorCode: 'NOT_ACCEPTABLE', description: 'Требуется заголовок Accept: application/json', message: 'Нужен Accept: application/json' });
  }
  if (!auth || !/^Bearer\s+/.test(auth)) {
    return res.status(401).json({ errorCode: 'UNAUTHORIZED', description: 'Требуется заголовок Authorization: Bearer <token>', message: 'Нужен Authorization: Bearer <token>' });
  }
  return null;
}

function createServer() {
  const app = express();
  app.use(cors());
  app.use(morgan('dev'));
  app.use(express.json());

  // Эндпоинт баланса (GET /partner/payout/v1/agents/:agentId/points/:pointId/balance)
  app.get('/partner/payout/v1/agents/:agentId/points/:pointId/balance', (req, res) => {
    const err = requireHeaders(req, res);
    if (err) return; // Ответ уже отправлен внутри requireHeaders
    // Статический демо-баланс: balance 200, overdraft 200, available 400
    const balance = makeMoney('200.00');
    const overdraft = makeMoney('200.00');
    const available = makeMoney('400.00');
    res.json({ balance, overdraft, available, message: 'Баланс успешно получен' });
  });

  // Создание платежа (PUT /partner/payout/v1/agents/:agentId/points/:pointId/payments/:paymentId)
  app.put('/partner/payout/v1/agents/:agentId/points/:pointId/payments/:paymentId', (req, res) => {
    const err = requireHeaders(req, res);
    if (err) return;

    const { paymentId } = req.params;
    const body = req.body || {};

    const now = nowIso();
    const amount = body.amount || { value: '0.00', currency: 'RUB' };
    const recipientDetails = body.recipientDetails || { providerCode: 'qiwi-wallet', fields: { account: '0000000000' } };
    const customer = body.customer || undefined;
    const source = body.source || { paymentType: 'NO_EXTRA_CHARGE', paymentToolType: 'BANK_ACCOUNT', paymentTerminalType: 'INTERNET_BANKING' };

    const info = {
      paymentId,
      creationDateTime: now,
      expirationDatetime: now,
      status: { value: 'READY', changedDateTime: now },
      recipientDetails,
      amount,
      commission: makeMoney('2.00'),
      customer,
      source,
      customFields: body.customFields || undefined,
      callbackUrl: body.callbackUrl || undefined,
      IdentificationType: body.IdentificationType || 'NONE',
      billingDetails: body.billingDetails || undefined,
    };

    payments.set(paymentId, info);
    res.json({ ...info, message: 'Платёж создан' });
  });

  // Исполнение платежа (POST /partner/payout/v1/agents/:agentId/points/:pointId/payments/:paymentId/execute)
  app.post('/partner/payout/v1/agents/:agentId/points/:pointId/payments/:paymentId/execute', (req, res) => {
    const err = requireHeaders(req, res);
    if (err) return;

    const { paymentId } = req.params;
    const p = payments.get(paymentId);
    if (!p) {
      return res.status(404).json({ errorCode: 'PAYMENT_NOT_FOUND', description: 'Платёж не найден', message: 'Платёж не найден' });
    }
    p.status = { value: 'COMPLETED', changedDateTime: nowIso() };
    // Имитация наличия комиссии (как в примерах спецификации)
    if (!p.commission) p.commission = makeMoney('2.00');

    payments.set(paymentId, p);
    res.json({ ...p, message: 'Платёж исполнен' });
  });

  // Список платежей (GET /partner/payout/v1/agents/:agentId/points/:pointId/payments)
  app.get('/partner/payout/v1/agents/:agentId/points/:pointId/payments', (req, res) => {
    const err = requireHeaders(req, res);
    if (err) return;

    const list = Array.from(payments.values());
    res.json(list);
  });

  // Корневой маршрут (для быстрой проверки работы мока)
  app.get('/', (req, res) => {
    res.json({ name: 'QIWI Payout Mock', version: '1.0.0', docs: 'https://developer.qiwi.com/ru/payout/v1/#about', message: 'Мок-сервис работает' });
  });

  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`Мок-сервер запущен: http://localhost:${port}`);
  });

  return { app, server };
}

if (require.main === module) {
  createServer();
}

module.exports = { createServer }; 
