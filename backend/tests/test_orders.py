"""
Order flow tests — validates business rules (price computed server-side, empty orders blocked, etc.)
Run with: pytest tests/
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.main import app
from app.core.database import get_db, Base
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.restaurant import Restaurant, RestaurantStatus
from app.models.table import Table
from app.models.menu import MenuCategory, MenuItem

TEST_DATABASE_URL = "postgresql+asyncpg://menuflow:menuflow@localhost:5432/menuflow_test"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSession() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def demo_restaurant():
    async with TestSession() as db:
        restaurant = Restaurant(name="Test Restaurant", slug="test-rest", status=RestaurantStatus.ACTIVE)
        db.add(restaurant)
        await db.flush()
        cat = MenuCategory(restaurant_id=restaurant.id, name="Mains", is_active=True)
        db.add(cat)
        await db.flush()
        item = MenuItem(restaurant_id=restaurant.id, category_id=cat.id, name="Burger", price=10.00, is_available=True)
        table = Table(restaurant_id=restaurant.id, number=1, is_active=True)
        db.add_all([item, table])
        await db.commit()
        await db.refresh(restaurant)
        await db.refresh(item)
        await db.refresh(table)
        return restaurant, table, item


@pytest.mark.asyncio
async def test_create_order_success(client, demo_restaurant):
    restaurant, table, item = demo_restaurant
    response = await client.post(
        f"/public/{restaurant.slug}/table/{table.public_token}/orders",
        json={"items": [{"menu_item_id": str(item.id), "quantity": 2}]}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["total_amount"] == 20.0
    assert data["status"] == "new"
    assert len(data["items"]) == 1
    assert data["items"][0]["item_price_snapshot"] == 10.0


@pytest.mark.asyncio
async def test_create_order_empty_items(client, demo_restaurant):
    restaurant, table, item = demo_restaurant
    response = await client.post(
        f"/public/{restaurant.slug}/table/{table.public_token}/orders",
        json={"items": []}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_menu(client, demo_restaurant):
    restaurant, table, item = demo_restaurant
    response = await client.get(f"/public/{restaurant.slug}/table/{table.public_token}/menu")
    assert response.status_code == 200
    data = response.json()
    assert data["restaurant"]["slug"] == restaurant.slug
    assert len(data["menu"]) >= 1
