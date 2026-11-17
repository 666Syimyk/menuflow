-- Public order capabilities and feedback review state
ALTER TABLE "orders"
ADD COLUMN "public_token" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "orders_public_token_key" ON "orders"("public_token");

ALTER TABLE "waiter_calls"
ADD COLUMN "order_id" TEXT;

ALTER TABLE "feedback"
ADD COLUMN "is_reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- Cashier MVP supports a generic fallback method.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

-- Tenant and operational indexes
CREATE INDEX "orders_restaurant_id_idx" ON "orders"("restaurant_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX "orders_restaurant_id_status_created_at_idx"
ON "orders"("restaurant_id", "status", "created_at");
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");
CREATE INDEX "waiter_calls_table_id_status_idx" ON "waiter_calls"("table_id", "status");
CREATE INDEX "dishes_restaurant_id_category_id_idx" ON "dishes"("restaurant_id", "category_id");
CREATE INDEX "qr_codes_table_id_is_active_idx" ON "qr_codes"("table_id", "is_active");
CREATE INDEX "subscriptions_restaurant_id_status_idx" ON "subscriptions"("restaurant_id", "status");
CREATE INDEX "users_restaurant_id_role_idx" ON "users"("restaurant_id", "role");

ALTER TABLE "waiter_calls"
ADD CONSTRAINT "waiter_calls_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
