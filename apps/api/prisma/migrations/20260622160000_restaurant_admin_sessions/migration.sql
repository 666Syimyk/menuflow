ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

CREATE TYPE "AdminSessionPolicy" AS ENUM (
  'deny_second_login',
  'kick_previous_session'
);

ALTER TABLE "restaurants"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN "tariff_id" TEXT,
  ADD COLUMN "subscription_ends_at" TIMESTAMP(3),
  ADD COLUMN "admin_limit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "admin_session_policy" "AdminSessionPolicy" NOT NULL DEFAULT 'deny_second_login';

ALTER TABLE "restaurants"
  ADD CONSTRAINT "restaurants_tariff_id_fkey"
  FOREIGN KEY ("tariff_id") REFERENCES "plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "restaurant_id" TEXT,
  "role" "Role" NOT NULL,
  "session_id" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_session_id_key"
  ON "user_sessions"("session_id");
CREATE INDEX "user_sessions_user_id_idx"
  ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_restaurant_id_role_is_active_idx"
  ON "user_sessions"("restaurant_id", "role", "is_active");

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
