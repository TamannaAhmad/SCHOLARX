# SCHOLARX Web Application

A Django REST API backend with a vanilla HTML/JavaScript frontend for student matching and project collaboration.

## Project Structure

```
webapp/
├── backend/          # Django REST API backend
│   ├── accounts/     # User authentication and accounts
│   ├── projects/     # Projects and study groups
│   └── scholarx_backend/  # Django project settings
└── frontend/         # HTML/JavaScript frontend
    ├── index.html
    ├── login.html
    ├── dashboard.html
    └── src/api/      # API client modules
```

## Prerequisites

1. **Python 3.11+** (with virtual environment support)
2. **PostgreSQL** database server
3. **Node.js** (optional, for serving frontend with Live Server or similar)

## Setup Instructions

### 1. Database Setup

#### Installing PostgreSQL

If you don't have PostgreSQL installed:

1. **Download PostgreSQL:**
   - Visit: https://www.postgresql.org/download/windows/
   - Download the Windows installer
   - Run the installer and follow the setup wizard
   - **Remember the password** you set for the `postgres` superuser account

2. **Verify Installation:**
   - PostgreSQL should be running as a Windows service
   - You can check in Services (services.msc) or Task Manager

#### Creating the Database

You can create the database using any of these methods:

##### Method 1: Using psql Command Line (Recommended)

**If `psql` is not recognized:**

1. **Find your PostgreSQL installation path:**
   - Common locations:
     - `C:\Program Files\PostgreSQL\15\bin\psql.exe`
     - `C:\Program Files\PostgreSQL\14\bin\psql.exe`
     - `C:\Program Files\PostgreSQL\13\bin\psql.exe`
   - Or search for `psql.exe` in File Explorer

2. **Use the full path to psql:**
   ```powershell
   & "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres
   ```
   (Replace `15` with your PostgreSQL version number)

3. **Or add PostgreSQL to PATH (permanent solution):**
   - Open System Properties → Environment Variables
   - Under "System variables", find "Path" and click "Edit"
   - Click "New" and add: `C:\Program Files\PostgreSQL\15\bin`
   - Click "OK" on all dialogs
   - **Restart PowerShell** for changes to take effect

**Once psql is accessible:**

1. **Connect to PostgreSQL:**
   ```bash
   psql -U postgres
   ```
   - Enter the password you set during PostgreSQL installation

2. **Create the database:**
   ```sql
   CREATE DATABASE SCHOLARX;
   ```

3. **Verify the database was created:**
   ```sql
   \l
   ```
   - You should see `SCHOLARX` in the list

4. **Exit psql:**
   ```sql
   \q
   ```

**Alternative one-liner (if you know the password):**
```bash
psql -U postgres -c "CREATE DATABASE SCHOLARX;"
```

Or with full path:
```powershell
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE SCHOLARX;"
```

##### Method 2: Using pgAdmin (GUI Tool)

1. **Open pgAdmin** (usually installed with PostgreSQL)

2. **Connect to PostgreSQL server:**
   - Expand "Servers" in the left panel
   - Click on your PostgreSQL server (e.g., "PostgreSQL 15")
   - Enter the password if prompted

3. **Create the database:**
   - Right-click on "Databases"
   - Select "Create" → "Database..."
   - Enter database name: `SCHOLARX`
   - Click "Save"

##### Method 3: Using SQL Command in pgAdmin

1. **Open pgAdmin** and connect to your server

2. **Open Query Tool:**
   - Right-click on "postgres" database
   - Select "Query Tool"

3. **Run the SQL command:**
   ```sql
   CREATE DATABASE SCHOLARX;
   ```

4. **Execute the query** (F5 or click the Execute button)

#### Verify Database Connection

Test that Django can connect to the database:

1. **Update database credentials** (if needed) in `backend/scholarx_backend/settings.py` or create a `.env` file:
   ```env
   DB_NAME=SCHOLARX
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   DB_HOST=localhost
   DB_PORT=5432
   ```

2. **Test connection from Django:**
   ```bash
   cd backend
   python manage.py dbshell
   ```
   - If successful, you'll see the PostgreSQL prompt
   - Type `\q` to exit

### 2. Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Activate the virtual environment:**
   - On Windows:
     ```bash
     venv\Scripts\activate
     ```
   - On Linux/Mac:
     ```bash
     source venv/bin/activate
     ```

3. **Install dependencies** (if not already installed):
   ```bash
   pip install -r requirements.txt
   ```

4. **Create a `.env` file** in the `backend/` directory (optional, defaults are used if not present):
   ```env
   DB_NAME=SCHOLARX
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_HOST=localhost
   DB_PORT=5432
   ```

5. **Run database migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Create a superuser** (optional, for admin access):
   ```bash
   python manage.py createsuperuser
   ```

### 3. Running the Backend

Start the Django development server:

```bash
python manage.py runserver
```

The backend will be available at: **http://localhost:8000**

API endpoints:
- Authentication: `http://localhost:8000/api/auth/`
- Projects: `http://localhost:8000/api/projects/`
- Admin: `http://localhost:8000/admin/`

### 4. Frontend Setup

The frontend can be served in two ways:

#### Option A: Using Django (Recommended for Development)

The Django backend is configured to serve the frontend files automatically. Once the backend is running, you can access:

- **http://localhost:8000/** - Main page
- **http://localhost:8000/login.html** - Login page
- **http://localhost:8000/dashboard.html** - Dashboard
- **http://localhost:8000/register.html** - Registration page
- And other HTML pages...

#### Option B: Using a Static File Server

If you prefer to use a separate server for the frontend (e.g., VS Code Live Server):

1. **Using VS Code Live Server:**
   - Install the "Live Server" extension
   - Right-click on `frontend/index.html` and select "Open with Live Server"
   - The frontend will typically run on `http://localhost:5500` or `http://127.0.0.1:5500`

2. **Using Python's HTTP server:**
   ```bash
   cd frontend
   python -m http.server 5500
   ```

3. **Using Node.js http-server:**
   ```bash
   npx http-server frontend -p 5500
   ```

## How Frontend and Backend Connect

### API Configuration

The frontend is configured to connect to the backend API at `http://localhost:8000/api/`:

- **Authentication API**: `http://localhost:8000/api/auth/` (defined in `frontend/src/api/auth.js`)
- **Projects API**: `http://localhost:8000/api/projects/` (defined in `frontend/src/api/projects.js`, `groups.js`, `messages.js`)

### Authentication

The application uses **Knox Token Authentication**:

1. When a user logs in, the backend returns a token
2. The frontend stores this token in `localStorage` as `authToken`
3. All subsequent API requests include the token in the `Authorization` header:
   ```
   Authorization: Token <token_value>
   ```

### CORS Configuration

The backend is configured to allow requests from:
- `http://localhost:8000` (Django serving frontend)
- `http://localhost:5500` (Live Server or other static server)
- `http://localhost:3000` (React dev server, if needed)

CORS is enabled for development. The settings are in `backend/scholarx_backend/settings.py`.

### Connection Flow

1. **Frontend makes API request** → `fetch('http://localhost:8000/api/auth/login/', ...)`
2. **Backend processes request** → Django REST Framework handles authentication
3. **Backend returns response** → JSON data with token
4. **Frontend stores token** → `localStorage.setItem('authToken', response.token)`
5. **Subsequent requests** → Include token in `Authorization: Token <token>` header

## Quick Start Guide

1. **Start PostgreSQL** (make sure it's running)

2. **Terminal 1 - Backend:**
   ```bash
   cd backend
   venv\Scripts\activate  # Windows
   # or: source venv/bin/activate  # Linux/Mac
   python manage.py runserver
   ```

3. **Access the application:**
   - Open browser to: **http://localhost:8000**
   - Or if using Live Server: **http://localhost:5500** (make sure backend is running on port 8000)

## Troubleshooting

### Database Connection Issues

**"FATAL: password authentication failed"**
- Verify your PostgreSQL password in `.env` file or `settings.py`
- Try resetting the postgres user password:
  ```bash
  psql -U postgres
  ALTER USER postgres WITH PASSWORD 'your_new_password';
  ```

**"FATAL: database 'SCHOLARX' does not exist"**
- Create the database using one of the methods in the Database Setup section above
- Verify the database name matches exactly (case-sensitive): `SCHOLARX`

**"could not connect to server" or "Connection refused"**
- Check if PostgreSQL service is running:
  - Windows: Open Services (services.msc) and look for "postgresql" service
  - Or run: `pg_ctl status` in Command Prompt
- Start PostgreSQL service if it's stopped
- Verify the port (default is 5432) in your `.env` file

**"psql: command not found"**
- PostgreSQL bin directory is not in your PATH
- Add PostgreSQL bin to PATH, or use full path:
  - Windows: `C:\Program Files\PostgreSQL\15\bin\psql.exe -U postgres`
  - Or use pgAdmin instead

**"django.db.utils.OperationalError: could not connect to server"**
- Verify database credentials in `.env` file or `settings.py`
- Test connection manually: `python manage.py dbshell`
- Check if PostgreSQL is running and accessible

### Backend won't start
- Check if PostgreSQL is running (see Database Connection Issues above)
- Verify database credentials in `.env` or settings.py
- Ensure virtual environment is activated
- Run `python manage.py migrate` if you see database errors
- Check `backend/django.log` for detailed error messages

### Frontend can't connect to backend
- Verify backend is running on `http://localhost:8000`
- Check browser console for CORS errors
- Ensure the API_BASE_URL in frontend files matches your backend URL
- If using a different port, update CORS settings in `backend/scholarx_backend/settings.py`

### Authentication issues
- Check that token is being stored: `localStorage.getItem('authToken')` in browser console
- Verify token is included in request headers
- Check backend logs for authentication errors

## Development Notes

- **Backend logs**: Check `backend/django.log` for detailed logs
- **Database**: Uses PostgreSQL (configured in `settings.py`)
- **Authentication**: Knox tokens (no expiration by default)
- **API Format**: JSON requests/responses
- **Static Files**: Served by Django in development mode

## Environment Variables

Create a `.env` file in the `backend/` directory with:

```env
# Database
DB_NAME=SCHOLARX
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# Email (optional, defaults to console backend)
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=webmaster@localhost

# Frontend URL (optional)
FRONTEND_URL=http://localhost:3000
FRONTEND_BASE_URL=http://localhost:8000
```

