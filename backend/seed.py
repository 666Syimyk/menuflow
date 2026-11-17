"""
Seed script — creates demo data for MenuFlow.

Run: python seed.py
Requires the database to be running and migrations applied.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.restaurant import Restaurant, RestaurantStatus
from app.models.tariff import Tariff
from app.models.table import Table
from app.models.menu import MenuCategory, MenuItem

engine = create_async_engine(settings.DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    async with SessionLocal() as db:
        # --- Tariffs ---
        start_tariff = Tariff(name="Start", price=29.99, period_days=30, max_tables=5, max_staff=3, max_menu_items=30)
        pro_tariff = Tariff(name="Pro", price=59.99, period_days=30, max_tables=20, max_staff=10, max_menu_items=100, analytics_enabled=True, feedback_enabled=True)
        business_tariff = Tariff(name="Business", price=99.99, period_days=30, max_tables=50, max_staff=25, max_menu_items=500, analytics_enabled=True, feedback_enabled=True, branding_enabled=True)
        db.add_all([start_tariff, pro_tariff, business_tariff])
        await db.flush()

        # --- Restaurant ---
        restaurant = Restaurant(
            name="Demo Restaurant",
            slug="demo",
            phone="+1 555-1234",
            address="123 Main Street, Demo City",
            status=RestaurantStatus.ACTIVE,
            tariff_id=pro_tariff.id,
            subscription_ends_at=datetime.now(timezone.utc) + timedelta(days=30),
            currency="USD",
            language="en",
        )
        db.add(restaurant)
        await db.flush()

        # --- Super Admin ---
        super_admin = User(
            name="Super Admin",
            email="super@menuflow.local",
            password_hash=hash_password("password123"),
            role=UserRole.SUPER_ADMIN,
        )
        db.add(super_admin)

        # --- Restaurant Admin ---
        admin = User(
            name="Demo Admin",
            email="admin@demo.local",
            password_hash=hash_password("password123"),
            role=UserRole.RESTAURANT_ADMIN,
            restaurant_id=restaurant.id,
        )
        db.add(admin)

        # --- Cook ---
        cook = User(
            name="Demo Cook",
            username="cook_demo",
            password_hash=hash_password("password123"),
            role=UserRole.COOK,
            restaurant_id=restaurant.id,
        )
        db.add(cook)

        # --- Waiters ---
        waiter1 = User(
            name="Waiter One",
            username="waiter_demo",
            password_hash=hash_password("password123"),
            role=UserRole.WAITER,
            restaurant_id=restaurant.id,
        )
        waiter2 = User(
            name="Waiter Two",
            username="waiter_demo2",
            password_hash=hash_password("password123"),
            role=UserRole.WAITER,
            restaurant_id=restaurant.id,
        )
        db.add_all([waiter1, waiter2])
        await db.flush()

        # --- Menu Categories ---
        cat_starters = MenuCategory(restaurant_id=restaurant.id, name="Starters", sort_order=1)
        cat_mains = MenuCategory(restaurant_id=restaurant.id, name="Main Course", sort_order=2)
        cat_drinks = MenuCategory(restaurant_id=restaurant.id, name="Drinks", sort_order=3)
        db.add_all([cat_starters, cat_mains, cat_drinks])
        await db.flush()

        # --- Menu Items ---
        items = [
            MenuItem(restaurant_id=restaurant.id, category_id=cat_starters.id, name="Caesar Salad", description="Fresh romaine lettuce, croutons, Parmesan, Caesar dressing", price=8.50, weight="250g", cooking_time=5, is_available=True, is_popular=True, sort_order=1),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_starters.id, name="Tomato Soup", description="Creamy tomato soup with basil and croutons", price=6.00, weight="300ml", cooking_time=10, is_available=True, is_popular=False, sort_order=2),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_starters.id, name="Bruschetta", description="Toasted bread with tomatoes, garlic, and basil", price=7.00, weight="180g", cooking_time=5, is_available=True, is_popular=False, sort_order=3),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_mains.id, name="Grilled Salmon", description="Atlantic salmon fillet with lemon butter and seasonal vegetables", price=22.00, weight="350g", cooking_time=20, is_available=True, is_popular=True, sort_order=1),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_mains.id, name="Ribeye Steak", description="12oz prime ribeye, medium-rare by default, served with fries", price=32.00, weight="400g", cooking_time=25, is_available=True, is_popular=True, sort_order=2),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_mains.id, name="Pasta Carbonara", description="Spaghetti with pancetta, eggs, Pecorino Romano, black pepper", price=14.00, weight="320g", cooking_time=15, is_available=True, is_popular=False, sort_order=3),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_mains.id, name="Margherita Pizza", description="Classic tomato sauce, mozzarella, fresh basil", price=13.00, weight="400g", cooking_time=20, is_available=True, is_popular=False, sort_order=4),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_drinks.id, name="Fresh Orange Juice", description="Freshly squeezed orange juice", price=4.50, weight="400ml", cooking_time=3, is_available=True, is_popular=True, sort_order=1),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_drinks.id, name="Espresso", description="Double shot Italian espresso", price=3.00, weight="60ml", cooking_time=2, is_available=True, is_popular=False, sort_order=2),
            MenuItem(restaurant_id=restaurant.id, category_id=cat_drinks.id, name="Sparkling Water", description="San Pellegrino 750ml", price=3.50, weight="750ml", cooking_time=1, is_available=True, is_popular=False, sort_order=3),
        ]
        db.add_all(items)
        await db.flush()

        # --- Tables with QR tokens ---
        tables = []
        for i in range(1, 6):
            t = Table(restaurant_id=restaurant.id, number=i, zone="Main Hall", is_active=True)
            tables.append(t)
        db.add_all(tables)
        await db.flush()

        await db.commit()

        print("✓ Seed complete!")
        print(f"  Super Admin: super@menuflow.local / password123")
        print(f"  Admin:       admin@demo.local / password123")
        print(f"  Cook:        cook_demo / password123")
        print(f"  Waiter:      waiter_demo / password123")
        print(f"  Restaurant:  {restaurant.name} (slug: {restaurant.slug})")
        print(f"  Tables:      {len(tables)} tables created")
        for t in tables:
            print(f"    Table #{t.number}: /public/demo/table/{t.public_token}/menu")


if __name__ == "__main__":
    import sys as _sys
    if _sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed())
