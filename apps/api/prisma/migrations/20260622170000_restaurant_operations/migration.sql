CREATE TYPE "SessionEndReason" AS ENUM (
  'logout',
  'kicked_by_new_login',
  'revoked_by_super_admin',
  'expired'
);

ALTER TABLE "restaurants"
  ADD COLUMN "allow_orders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_waiter_calls" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_bill_requests" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "user_sessions"
  ADD COLUMN "logout_at" TIMESTAMP(3),
  ADD COLUMN "end_reason" "SessionEndReason";

ALTER TABLE "audit_logs"
  ADD COLUMN "user_agent" TEXT;

CREATE INDEX "user_sessions_restaurant_id_created_at_idx"
  ON "user_sessions"("restaurant_id", "created_at");

CREATE INDEX "audit_logs_restaurant_id_created_at_idx"
  ON "audit_logs"("restaurant_id", "created_at");
