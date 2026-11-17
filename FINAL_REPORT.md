# MenuFlow: Final Audit Report

Дата: 2026-06-15

## 1. Итог

Критические P0 из контрольного аудита устранены. MVP компилируется, мигрируется, заполняется seed-данными и проходит автоматизированный полный путь заказа.

## 2. Security

- Публичный статус заказа переведен с `orderId` на уникальный `publicToken`.
- Socket.IO подписывает гостя на заказ только после проверки `publicToken`.
- Неверный JWT разрывает socket-соединение.
- Комнаты разделены по ресторану и роли; staff больше не получает admin-события.
- Login/refresh/socket блокируют неактивных пользователей, рестораны и истекшие подписки.
- ADMIN не может создавать `ADMIN` или `SUPER_ADMIN`.
- Tenant ownership проверяется для столов, блюд, вариантов, добавок, заказов и платежей.
- Пустые заказы, stop-list, скрытые блюда и чужие опции отклоняются.
- Цена рассчитывается только на backend.
- Платеж транзакционный; дубликат, ноль и недоплата запрещены.
- CORS и WebSocket origins берутся из env, wildcard удален.
- Реальные `.env` удалены; ignore покрывает вложенные env-файлы.

## 3. Database

- Добавлен `Order.publicToken`.
- Добавлены индексы для частых tenant/status/date запросов.
- `WaiterCall` может быть связан с заказом.
- Feedback получил reviewed-поля.
- Добавлен `PaymentMethod.OTHER`.
- Добавлены миграции `20260615090000_security_and_mvp` и `20260615100000_user_restaurant_constraint`.
- На тестовой PostgreSQL применены все 3 миграции.

## 4. Business Flow

Проверен путь:

`QR -> NEW -> ACCEPTED -> COOKING -> READY -> DELIVERING -> SERVED -> BILL_REQUESTED -> PAID -> CLOSED`

Дополнительно проверено:

- старый публичный status endpoint возвращает 404;
- bill call связан с заказом;
- недоплата возвращает 400;
- dashboard обновляется;
- ресторан без подписки не входит;
- после подписки входит;
- заблокированный ресторан снова получает 401.

## 5. Roles and UI

- Реализованы панели всех пяти служебных ролей.
- Добавлена страница `/super/subscriptions`.
- Feedback можно отметить обработанным и удалить.
- Waiter видит неназначенные и собственные заказы.
- Sidebar получил mobile drawer; waiter получил нижнюю навигацию.
- QR-заказ восстанавливается из localStorage и обновляется через socket/polling.
- QR-код можно скачать как PNG.

## 6. Infrastructure

- Dockerfiles используют корень monorepo и общий lockfile.
- Compose согласован с `postgres / 4.0 / menuflow`.
- Добавлен рабочий `nginx/nginx.conf`.
- Убраны небезопасные bind mounts и захардкоженные application secrets.

Docker CLI на проверочной машине отсутствует, поэтому `docker compose build/up` фактически не запускался.

## 7. Dependencies

- Next.js обновлен до `15.5.19`.
- NestJS обновлен до `11.1.26`.
- Multer обновлен до `2.1.1`, bcrypt до `6`.
- Удалены неиспользуемые Bull, Redis client, ExcelJS, UUID и next-pwa.
- Production audit: 0 critical, 0 high, 2 moderate.

Оставшиеся moderate относятся к одному вложенному `postcss` Next.js (npm показывает его как пакет и как влияние на Next). Его следует закрыть следующим совместимым framework patch; принудительная подмена вложенного runtime-пакета не применялась.

## 8. Verification

Успешно:

- Prisma format/generate/validate
- Prisma migration deploy/status
- Seed: 6 пользователей, 20 блюд, 3 demo-заказа
- API production build
- Web production build: 25 routes
- API lint
- Web lint
- 3 Jest suites / 3 tests
- HTTP E2E smoke
- WebSocket security smoke

WebSocket результат:

```json
{
  "invalidOrderRejected": true,
  "validOrderEventReceived": true,
  "invalidJwtRejected": true
}
```

## 9. Environment Finding

Переданные учетные данные PostgreSQL `postgres / 4.0` на этой Windows-машине не прошли аутентификацию. Для реальной проверки использована уже существующая локальная учетная запись `menuflow / menuflow_pass` и отдельная БД `menuflow_mvp_test`.

Системный пароль PostgreSQL не изменялся.

## 10. Test Gaps

- In-app browser недоступен (`iab` unavailable), поэтому визуальный browser QA не выполнен.
- Docker не установлен, поэтому контейнерный smoke test не выполнен.
- Нет интеграционного теста реального MinIO/S3 upload.
- Unit coverage пока точечный, а не полный.

## 11. После MVP

1. Добавить CI с PostgreSQL service, migrations, seed, tests и Playwright.
2. Добавить платежные интеграции и idempotency keys.
3. Добавить refresh-token reuse detection и принудительный logout sessions.
4. Добавить централизованный audit viewer, Sentry/OpenTelemetry и backup drills.
5. Расширить UI управления вариантами/addons и пакетную печать QR/PDF.

## 12. Readiness

С учетом перечисленных внешних ограничений проект готов к pilot deployment. Перед публичным production launch обязательны Docker smoke test, визуальный E2E, реальные S3 credentials, HTTPS и замена всех demo-секретов.
