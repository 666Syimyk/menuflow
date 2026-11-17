ALTER TABLE "users"
ADD CONSTRAINT "users_restaurant_assignment_check"
CHECK (
  ("role" = 'SUPER_ADMIN' AND "restaurant_id" IS NULL)
  OR
  ("role" <> 'SUPER_ADMIN' AND "restaurant_id" IS NOT NULL)
);
