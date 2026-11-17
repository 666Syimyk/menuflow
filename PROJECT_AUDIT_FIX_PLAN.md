# MenuFlow: Control Audit and Fix Plan

Audit date: 2026-06-15

## 1. What Works Now

- NestJS API compiles successfully.
- Next.js routes exist for SUPER_ADMIN, ADMIN, WAITER, COOK, CASHIER, and the public QR menu.
- Prisma contains the core restaurant, menu, table, order, payment, feedback, subscription, and audit models.
- JWT login, refresh-token rotation, role guards, order status history, server-side price calculation, and Socket.IO infrastructure exist.
- Admin menu, tables, orders, staff, reports, settings, waiter, kitchen, cashier, and super-admin screens have initial implementations.
- The seed creates a super admin, demo restaurant, staff, halls, tables, QR codes, categories, dishes, variants, and addons.
- Nginx virtual-host configuration exists at `nginx/conf.d/default.conf`.

## 2. What Is Broken or Incomplete

- Frontend typecheck fails in the QR page and super-admin users page.
- The public QR page expects `res.data.data`, while the backend returns plain objects.
- Active public orders are not restored from localStorage.
- Public order status is exposed by guessable `orderId`.
- Guest WebSocket subscriptions accept any `orderId`.
- WebSocket CORS is `*`; invalid JWT connections are not disconnected.
- Every restaurant staff socket is incorrectly joined to the admin room.
- Blocked/inactive restaurants and expired subscriptions do not prevent staff login or refresh.
- ADMIN can submit privileged roles when creating staff.
- Payment accepts an amount below the order total, including zero.
- Empty public/admin orders are accepted by DTO validation.
- Variant/addon ownership is not fully checked during order creation.
- Variant/addon update endpoints do not enforce restaurant ownership.
- Closed restaurants can still receive public orders.
- Bill requests are not linked to the active order and do not advance its lifecycle.
- Waiter order listing filters by `waiterId`, causing unassigned restaurant orders to disappear.
- Feedback module is empty while `/admin/feedback` calls it.
- `docker-compose.yml` mounts missing `nginx/nginx.conf`, uses inconsistent PostgreSQL credentials, and builds workspace apps outside the monorepo lockfile context.
- Root `.env` exists locally; env ignore rules do not explicitly cover nested app env files.
- Prisma lacks required indexes and a secure public order token.
- `PaymentMethod` lacks the requested `OTHER` option.
- `/super/subscriptions` is missing.
- Existing documentation and reports claim checks that are not currently passing.

## 3. P0 Critical Issues

1. Public order IDOR through `GET /public/orders/:orderId/status`.
2. Unauthorized WebSocket order-room subscription and cross-role room leakage.
3. Missing tenant/role validation for staff creation and menu option updates.
4. Underpayment and zero-value payment acceptance.
5. Public order accepts empty/invalid selections and ignores some ownership checks.
6. Blocked restaurants can continue authenticating staff.
7. QR menu API contract mismatch breaks menu, order creation, and status.
8. Docker Compose cannot start because the mounted Nginx config does not exist.

## 4. P1 Issues

- Missing feedback backend and super-admin subscriptions screen.
- Waiter visibility for unassigned orders is incorrect.
- Bill calls are detached from orders.
- Missing database indexes and cross-entity tenant checks.
- Mobile admin/super/waiter navigation uses a fixed desktop sidebar.
- Seed is smaller than the requested demo dataset and has no demo orders.
- Error handling hides feedback API failures as an empty state.
- Cancellation reason is only written to audit metadata, not persisted on the order.
- Docker and full E2E execution cannot currently be verified because Docker is not installed in this environment.

## 5. Planned Fixes

- Standardize on plain backend response objects and make every frontend API call consume that format.
- Add `Order.publicToken`, secure public status lookup, token-based socket subscription, and localStorage restore.
- Enforce restaurant state/subscription checks in login, refresh, JWT validation, and sockets.
- Harden RBAC and tenant ownership in staff, menu options, tables, orders, payments, and sockets.
- Validate non-empty orders, positive quantities, dish visibility/availability, variant/addon ownership, and restaurant availability.
- Make payments transactional, reject underpayment/duplicates, validate methods, and update order/table lifecycle safely.
- Link bill requests to active orders and waiter calls.
- Implement feedback endpoints and the super subscriptions page.
- Add required Prisma indexes and migration SQL; expand the seed.
- Repair monorepo Dockerfiles, compose env, and Nginx configuration.
- Fix frontend type errors and responsive navigation.
- Replace inaccurate README/final report claims with verified commands and limitations.

## 6. Readiness Verification

- `npm ci`
- `npm run db:generate`
- Prisma migration validation/deploy against PostgreSQL
- `npm run db:seed`
- Backend lint, typecheck/build, and tests
- Frontend lint, typecheck, and production build
- Static API/route contract checks
- Docker Compose config/build/up when Docker is available
- Browser checks for login redirects, responsive role layouts, and QR menu
- Manual order path: QR order -> waiter accept -> kitchen cooking/ready -> waiter served -> bill -> payment -> close -> dashboard update

