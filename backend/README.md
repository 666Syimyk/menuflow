# MenuFlow Backend

FastAPI + PostgreSQL backend for the MenuFlow QR-restaurant SaaS platform.

## Stack

- **Python 3.12** + **FastAPI** — async REST API + WebSocket
- **PostgreSQL** — primary database  
- **SQLAlchemy 2.0** (async) — ORM  
- **Alembic** — migrations  
- **Pydantic v2** — validation  
- **python-jose** — JWT  
- **passlib/bcrypt** — password hashing  
- **qrcode** — QR code generation  

## Quick Start (Docker)

```bash
cd backend
cp .env.example .env
docker compose up --build
```

API is available at `http://localhost:8000`  
Swagger docs at `http://localhost:8000/docs`

## Quick Start (local)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # edit DATABASE_URL
alembic upgrade head
python seed.py
uvicorn app.main:app --reload
```

## Seed Credentials

| Role               | Login                  | Password     |
|--------------------|------------------------|--------------|
| Super Admin        | super@menuflow.local   | password123  |
| Restaurant Admin   | admin@demo.local       | password123  |
| Cook               | cook_demo              | password123  |
| Waiter             | waiter_demo            | password123  |

## API Endpoints

| Group           | Prefix            | Description                        |
|-----------------|-------------------|------------------------------------|
| Auth            | `/auth`           | login, logout, refresh, me         |
| Super Admin     | `/super`          | restaurants, tariffs, users        |
| Tariffs         | `/tariffs`        | CRUD tariffs                       |
| Admin           | `/admin`          | restaurant profile, staff          |
| Menu            | `/menu`           | categories + items CRUD            |
| Tables          | `/tables`         | table management + QR download     |
| Orders          | `/orders`         | order list + status transitions    |
| Kitchen         | `/kitchen`        | cook dashboard                     |
| Waiter          | `/waiter`         | waiter panel, calls, bill requests |
| Payments        | `/payments`       | record manual payments             |
| Feedback        | `/feedback`       | guest reviews                      |
| Support         | `/support`        | support tickets                    |
| Activity Logs   | `/activity-logs`  | audit trail                        |
| Uploads         | `/uploads`        | logo + menu image uploads          |
| Public QR       | `/public`         | guest menu, orders, calls, feedback|

## WebSocket

Real-time updates are delivered via WebSocket:

- **Kitchen**: `ws://host/public/ws/kitchen/{restaurant_id}`
- **Waiter**: `ws://host/public/ws/waiter/{restaurant_id}`
- **Admin**: `ws://host/public/ws/admin/{restaurant_id}`
- **Guest (order status)**: `ws://host/public/ws/order/{order_public_token}`

## Tests

```bash
pytest tests/ -v
```

Requires a `menuflow_test` PostgreSQL database.

## Migrations

```bash
# Generate new migration after model changes
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory
│   ├── core/                # config, db, security, dependencies
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # FastAPI route handlers
│   ├── services/            # business logic helpers
│   └── websockets/          # WebSocket connection manager
├── alembic/                 # migrations
├── tests/                   # pytest tests
├── seed.py                  # demo data seeder
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```
