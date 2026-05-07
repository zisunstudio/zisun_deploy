# ZISUN Platform - Backend

This is the FastAPI backend for the ZISUN Content-Driven Commerce Platform.

## Prerequisites
- Python 3.12+
- PostgreSQL database

## Setup Instructions

1. **Virtual Environment & Dependencies**
   The virtual environment is already created. To activate it and run commands:
   ```powershell
   # Windows
   .\venv\Scripts\Activate.ps1
   ```

2. **Database Configuration**
   Ensure you have a PostgreSQL database running. You can update the connection credentials in the `app/core/config.py` file or create a `.env` file in the `backend` directory:
   ```env
   POSTGRES_SERVER=localhost
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=yourpassword
   POSTGRES_DB=zisun_db
   ```

3. **Running Migrations**
   Once your database is running, generate the initial migration based on the models:
   ```bash
   alembic revision --autogenerate -m "Initial schema"
   alembic upgrade head
   ```

4. **Running the Development Server**
   ```bash
   uvicorn app.main:app --reload
   ```

## Architecture Notes
- The backend uses **FastAPI** with **Pydantic V2**.
- Models are defined in `app/models/` using **SQLAlchemy 2.0** DeclarativeBase.
- `alembic/env.py` has been pre-configured to automatically read all models for `--autogenerate`.
- Both `sync` and `async` SQLAlchemy engines are configured in `app/core/database.py`. Use async routes for HTTP endpoints and sync routes for background workers (Celery).
