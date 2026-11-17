# MenuFlow

Commercial MVP для ресторанов: QR-меню, заказы, кухня, официанты, касса, отзывы, отчеты и управление подписками.

## Стек

- Next.js 15, React 18, Tailwind CSS
- NestJS 11, Prisma 5, PostgreSQL
- Socket.IO, JWT access/refresh tokens
- S3/MinIO для изображений
- Docker Compose и Nginx

## Роли

| Роль | Интерфейс |
|---|---|
| `SUPER_ADMIN` | `/super`: рестораны, пользователи, тарифы, подписки |
| `ADMIN` | `/admin`: меню, столы, сотрудники, заказы, платежи, отчеты, отзывы |
| `WAITER` | `/waiter`: новые и назначенные заказы, вызовы, столы |
| `COOK` | `/kitchen`: очередь кухни и статусы приготовления |
| `CASHIER` | `/cashier`: неоплаченные заказы и прием платежей |
| Гость | `/m/[qrToken]`: меню, корзина, заказ, статус, вызов официанта и счет |

## Быстрый старт

Требования: Node.js 20+, npm 10+, PostgreSQL 15+.

```powershell
Copy-Item .env.example .env
npm ci
npm run db:generate
```

Создайте БД и проверьте `DATABASE_URL` в `.env`. Затем:

```powershell
npm run prisma:migrate:prod --workspace=apps/api
npm run db:seed
npm run dev
```

Приложение: `http://localhost:3000`  
API: `http://localhost:3001/api/v1`  
Swagger: `http://localhost:3001/api/docs`

Для локального PostgreSQL из задания:

```env
DATABASE_URL=postgresql://postgres:4.0@localhost:5432/menuflow
```

Не храните реальные секреты в `.env.example` и не коммитьте `.env`.

## Docker

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed
```

После запуска откройте `http://localhost`. Compose использует PostgreSQL `postgres / 4.0 / menuflow`, API, web и Nginx.

## Demo-доступы

| Роль | Логин | Пароль |
|---|---|---|
| Super Admin | `superadmin` | `superadmin123` |
| Admin | `admin_demo` | `admin123` |
| Waiter | `waiter1` | `waiter123` |
| Cook | `cook1` | `cook123` |
| Cashier | `cashier1` | `cashier123` |

Seed создает 5 категорий, 20 блюд, столы, активные QR-коды и 3 демонстрационных заказа.

## Проверка QR

1. Войдите как `admin_demo`.
2. Откройте `/admin/tables`.
3. Откройте существующий QR или создайте новый.
4. Скопируйте ссылку либо скачайте PNG.
5. Откройте ссылку в отдельном браузере/на телефоне.

Активный токен также можно найти:

```sql
SELECT token FROM qr_codes WHERE is_active = true LIMIT 1;
```

## Полный путь заказа

1. Гость создает непустой заказ через QR.
2. Официант принимает заказ.
3. Повар переводит его в приготовление и затем в готовность.
4. Официант доставляет и отмечает заказ поданным.
5. Гость просит счет.
6. Кассир принимает полную оплату.
7. Admin закрывает заказ и проверяет `/admin/reports`.

Публичный статус доступен только по `Order.publicToken`; внутренний `orderId` не раскрывается как ключ доступа.

## Проверки

```powershell
npm run build
npm run lint
npm run test

$env:MENUFLOW_E2E_QR_TOKEN='<active-qr-token>'
.\scripts\e2e-smoke.ps1

$env:MENUFLOW_E2E_ORDER_TOKEN='<public-order-token>'
node scripts/ws-security-smoke.mjs
```

## Production

- Замените JWT, PostgreSQL и S3 секреты.
- Укажите HTTPS origins в `FRONTEND_URL`.
- Выполняйте `prisma migrate deploy` до запуска новой версии API.
- Не запускайте seed в рабочей БД.
- Настройте резервные копии PostgreSQL и S3.
- Ограничьте доступ к Swagger либо отключите его на внешнем контуре.
- Добавьте централизованные логи, мониторинг ошибок и health-check alerting.

## Диагностика

| Симптом | Проверка |
|---|---|
| Prisma не видит БД | `DATABASE_URL`, пользователь, пароль, порт и существование БД |
| 401 после входа | активность пользователя, статус ресторана и действующая подписка |
| QR не открывается | активность стола, QR, ресторана и подписки |
| WebSocket не подключается | `FRONTEND_URL`, `NEXT_PUBLIC_WS_URL`, reverse proxy upgrade headers |
| Фото не загружается | `S3_ENDPOINT`, ключи, bucket и доступность MinIO/S3 |

Сводка аудита и ограничения находятся в `FINAL_REPORT.md`.
