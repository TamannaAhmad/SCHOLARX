"""
Example secrets configuration file for SCHOLARX scheduling algorithm.
Copy this file to 'secrets.py' and fill in your actual values.
DO NOT commit the actual secrets.py file to version control.
"""

# Supabase Configuration
SUPABASE_URL = 'https://your-project.supabase.co'
SUPABASE_SERVICE_KEY = 'your_supabase_service_key_here'

# PostgreSQL Configuration (if using direct PostgreSQL)
POSTGRES_HOST = 'localhost'
POSTGRES_PORT = 5432
POSTGRES_DATABASE = 'scholarx_db'
POSTGRES_USER = 'your_username'
POSTGRES_PASSWORD = 'your_password'

# SQLAlchemy Configuration (if using SQLAlchemy)
SQLALCHEMY_DATABASE_URL = 'postgresql://username:password@localhost:5432/scholarx_db'

# Other API Keys (add as needed)
# OPENAI_API_KEY = 'your_openai_key_here'
# GOOGLE_API_KEY = 'your_google_key_here'
