"""
Basic auth tests. Run with: pytest tests/
Requires DATABASE_URL pointing to a test database.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.main import app
from app.core.database import get_db, Base
from app.core.security import hash_password
from app.models.user import User, UserRole

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
async def super_admin_user():
    async with TestSession() as db:
        user = User(
            name="Super Admin",
            email="super@test.local",
            password_hash=hash_password("password123"),
            role=UserRole.SUPER_ADMIN,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.mark.asyncio
async def test_login_success(client, super_admin_user):
    response = await client.post("/auth/login", json={"login": "super@test.local", "password": "password123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client, super_admin_user):
    response = await client.post("/auth/login", json={"login": "super@test.local", "password": "wrong"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(client, super_admin_user):
    login = await client.post("/auth/login", json={"login": "super@test.local", "password": "password123"})
    token = login.json()["access_token"]
    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "super@test.local"
    assert data["role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_me_without_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client, super_admin_user):
    login = await client.post("/auth/login", json={"login": "super@test.local", "password": "password123"})
    refresh_token = login.json()["refresh_token"]
    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_health_endpoint(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
