# QIWI Payout API — Local Mock + Tests

Набор из локального мок-сервера, тестов Playwright и коллекции Postman по спецификации QIWI Payout API.
Никакого реального доступа к API — все обращения идут к локальному мок-серверу, см. `src/mock-server.js`.

## Содержание
- Мок-сервер: `src/mock-server.js`
- Тесты Playwright: `tests/qiwi.payout.spec.ts`
- Конфиг Playwright: `playwright.config.ts`
- Коллекция Postman: `postman/qiwi-payout.postman_collection.json`

## Установка
1) Node.js 18+
2) Установить зависимости:
```
npm install
```

## Запуск мок-сервера (для Postman)
Если вы хотите проверить коллекцию Postman, поднимите мок-сервер:
```
npm run start:mock
```
Сервер поднимется на `http://localhost:3000`.

## Запуск тестов Playwright
Мок-сервер поднимается прямо внутри тестов автоматически, поэтому запускать его отдельно не нужно.
```
npx playwright install --with-deps
npm test
```
Тесты покрывают:
- доступ сервиса через `GET /payments` и проверку формата ответа (массив `PaymentInfo`).
- запрос баланса `GET /balance` с проверкой, что `available.value > 0`.
- создание платежа на 1 рубль `PUT /payments/{paymentId}` и проверку статуса `READY`.
- исполнение платежа `POST /payments/{paymentId}/execute` и проверку статуса `COMPLETED`.
- негативные сценарии (см. ниже).

## Коллекция Postman
Импортируйте `postman/qiwi-payout.postman_collection.json`.
Переменные по умолчанию:
- baseUrl = `http://localhost:3000`
- agentId = `acme`
- pointId = `00001`
- token = `test-token`
- paymentId = `pm-{{timestamp}}`

Коллекция содержит скрипты проверок на каждый запрос.

## Негативные сценарии
Мок валидирует заголовки и некоторые ошибки:

- 401 UNAUTHORIZED — отсутствует `Authorization: Bearer <token>`.
- 401 UNAUTHORIZED — неверный формат `Authorization` (без префикса `Bearer`).
- 406 NOT_ACCEPTABLE — отсутствует `Accept: application/json`.
- 406 NOT_ACCEPTABLE — неприемлемый `Accept` (например, `application/xml`).
- 404 PAYMENT_NOT_FOUND — `POST /payments/{paymentId}/execute` для несуществующего `paymentId`.

Все эти кейсы покрыты тестами в `tests/qiwi.payout.spec.ts`.
