# Try to import pandas, but make it optional
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError as e:
    # Defer logger setup until after it's defined; fall back to silent flag here
    PANDAS_AVAILABLE = False
    pd = None

from typing import List, Dict, Set, Optional, Tuple, Union, Any
from collections import defaultdict
import itertools
from datetime import datetime, time, timedelta
import json
import logging
import os
from contextlib import contextmanager

# Import secrets configuration
try:
    from secrets import SUPABASE_URL, SUPABASE_SERVICE_KEY, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD, SQLALCHEMY_DATABASE_URL
except ImportError:
    print("Warning: secrets.py not found. Please create secrets.py from secrets.example.py")
    # Fallback values (these should not be used in production)
    SUPABASE_URL = None
    SUPABASE_SERVICE_KEY = None
    POSTGRES_HOST = 'localhost'
    POSTGRES_PORT = 5432
    POSTGRES_DATABASE = 'scholarx_db'
    POSTGRES_USER = 'your_username'
    POSTGRES_PASSWORD = 'your_password'
    SQLALCHEMY_DATABASE_URL = None

# Database imports
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

try:
    from sqlalchemy import create_engine, text, MetaData, Table
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import QueuePool
    SQLALCHEMY_AVAILABLE = True
except ImportError:
    SQLALCHEMY_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)

# Reduce noise from third-party libraries in terminal output
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("postgrest").setLevel(logging.ERROR)
logging.getLogger("realtime").setLevel(logging.ERROR)

# If pandas import failed earlier, keep it quiet by default (debug-only)
if not 'PANDAS_AVAILABLE' in globals() or PANDAS_AVAILABLE is False:
    logger.debug("pandas not available: Unable to import required dependencies (safe to ignore if not using pandas)")

class DatabaseConfig:
    """Database configuration class with validation"""
    
    @staticmethod
    def create_postgresql_config(host: str, database: str, user: str, password: str, port: int = 5432) -> Dict:
        return {
            'type': 'postgresql',
            'host': host,
            'database': database,
            'user': user,
            'password': password,
            'port': port,
            'connection_pool_size': 5,
            'max_overflow': 10,
            'pool_timeout': 30,
            'pool_recycle': 3600
        }
    
    @staticmethod
    def create_supabase_config(url: str, service_key: str) -> Dict:
        return {
            'type': 'supabase',
            'url': url,
            'service_key': service_key
        }
    
    @staticmethod
    def create_sqlalchemy_config(connection_string: str, **kwargs) -> Dict:
        return {
            'type': 'sqlalchemy',
            'connection_string': connection_string,
            'pool_size': kwargs.get('pool_size', 5),
            'max_overflow': kwargs.get('max_overflow', 10),
            'pool_timeout': kwargs.get('pool_timeout', 30),
            'pool_recycle': kwargs.get('pool_recycle', 3600)
        }
    
    @staticmethod
    def create_config_from_secrets(db_type: str = 'supabase') -> Dict:
        """Create database configuration using values from secrets.py"""
        if db_type == 'supabase':
            if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
                raise ValueError("Supabase URL and service key not found in secrets.py")
            return DatabaseConfig.create_supabase_config(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        elif db_type == 'postgresql':
            if not all([POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD]):
                raise ValueError("PostgreSQL credentials not found in secrets.py")
            return DatabaseConfig.create_postgresql_config(
                POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT
            )
        
        elif db_type == 'sqlalchemy':
            if not SQLALCHEMY_DATABASE_URL:
                raise ValueError("SQLAlchemy database URL not found in secrets.py")
            return DatabaseConfig.create_sqlalchemy_config(SQLALCHEMY_DATABASE_URL)
        
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

class DatabaseConnector:
    """Enhanced database connector with connection pooling and error handling"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.connection = None
        self.engine = None
        self.Session = None
        self.connected = False
        
    def connect(self) -> bool:
        """Establish database connection with proper error handling"""
        try:
            db_type = self.config.get('type')
            
            if db_type == 'postgresql':
                return self._connect_postgresql()
            elif db_type == 'supabase':
                return self._connect_supabase()
            elif db_type == 'sqlalchemy':
                return self._connect_sqlalchemy()
            else:
                logger.error(f"Unsupported database type: {db_type}")
                return False
                
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return False
    
    def _connect_postgresql(self) -> bool:
        """Connect to PostgreSQL with connection pooling"""
        if not PSYCOPG2_AVAILABLE:
            logger.error("psycopg2 not installed. Install with: pip install psycopg2-binary")
            return False
        
        try:
            # Create connection pool using SQLAlchemy for better management
            connection_string = (
                f"postgresql://{self.config['user']}:{self.config['password']}"
                f"@{self.config['host']}:{self.config['port']}/{self.config['database']}"
            )
            
            self.engine = create_engine(
                connection_string,
                poolclass=QueuePool,
                pool_size=self.config.get('connection_pool_size', 5),
                max_overflow=self.config.get('max_overflow', 10),
                pool_timeout=self.config.get('pool_timeout', 30),
                pool_recycle=self.config.get('pool_recycle', 3600),
                echo=False  # Set to True for SQL debugging
            )
            
            # Test connection
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            self.Session = sessionmaker(bind=self.engine)
            self.connected = True
            logger.info("Connected to PostgreSQL database with connection pooling")
            return True
            
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            return False
    
    def _connect_supabase(self) -> bool:
        """Connect to Supabase"""
        if not SUPABASE_AVAILABLE:
            logger.error("supabase not installed. Install with: pip install supabase")
            return False
        
        try:
            self.connection = create_client(
                self.config['url'],
                self.config['service_key']
            )
            
            # Test connection by trying to fetch a simple query
            test_result = self.connection.table('sample_users').select('usn').limit(1).execute()
            
            self.connected = True
            logger.info("Connected to Supabase database")
            return True
            
        except Exception as e:
            logger.error(f"Supabase connection failed: {e}")
            return False
    
    def _connect_sqlalchemy(self) -> bool:
        """Connect using SQLAlchemy"""
        if not SQLALCHEMY_AVAILABLE:
            logger.error("sqlalchemy not installed. Install with: pip install sqlalchemy")
            return False
        
        try:
            self.engine = create_engine(
                self.config['connection_string'],
                poolclass=QueuePool,
                pool_size=self.config.get('pool_size', 5),
                max_overflow=self.config.get('max_overflow', 10),
                pool_timeout=self.config.get('pool_timeout', 30),
                pool_recycle=self.config.get('pool_recycle', 3600),
                echo=False  # Set to True for SQL debugging
            )
            
            # Test connection
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            self.Session = sessionmaker(bind=self.engine)
            self.connected = True
            logger.info("Connected via SQLAlchemy with connection pooling")
            return True
            
        except Exception as e:
            logger.error(f"SQLAlchemy connection failed: {e}")
            return False
    
    @contextmanager
    def get_connection(self):
        """Get database connection with proper cleanup"""
        if not self.connected:
            raise Exception("Database not connected. Call connect() first.")
        
        if self.config['type'] == 'supabase':
            yield self.connection
        elif self.engine:
            conn = self.engine.connect()
            try:
                yield conn
            finally:
                conn.close()
        else:
            raise Exception("No valid connection available")
    
    def execute_query(self, query: str, params: Dict = None) -> List[Dict]:
        """Execute query and return results as list of dictionaries"""
        try:
            if self.config['type'] == 'supabase':
                return self._execute_supabase_query(query, params)
            else:
                return self._execute_sql_query(query, params)
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            return []
    
    def _execute_supabase_query(self, query: str, params: Dict = None) -> List[Dict]:
        """Execute Supabase query (uses table methods, not raw SQL)"""
        # For Supabase, we'll use the table methods
        # This method is primarily for compatibility
        raise NotImplementedError("Use specific Supabase table methods instead of raw SQL")
    
    def _execute_sql_query(self, query: str, params: Dict = None) -> List[Dict]:
        """Execute SQL query for PostgreSQL/SQLAlchemy"""
        with self.get_connection() as conn:
            if params:
                result = conn.execute(text(query), params)
            else:
                result = conn.execute(text(query))
            
            return [dict(row._mapping) for row in result.fetchall()]
    
    def close(self):
        """Close database connection"""
        if self.engine:
            self.engine.dispose()
        self.connected = False
        logger.info("Database connection closed")

class EnhancedWebScheduleMatcher:
    """
    Enhanced Web-Ready Schedule Matcher with better database connectivity
    """
    
    def __init__(self, db_config: Dict):
        # Time slots covering full day (24 hours in 2-hour blocks)
        self.time_slots = [
            ("00:00", "02:00"), ("02:00", "04:00"), ("04:00", "06:00"), ("06:00", "08:00"),
            ("08:00", "10:00"), ("10:00", "12:00"), ("12:00", "14:00"), ("14:00", "16:00"),
            ("16:00", "18:00"), ("18:00", "20:00"), ("20:00", "22:00"), ("22:00", "00:00")
        ]
        
        # Days mapping (0=Sunday, 1=Monday, etc. - matching your schema)
        self.days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        self.day_numbers = {day: idx for idx, day in enumerate(self.days)}
        
        # Initialize database connector
        self.db = DatabaseConnector(db_config)
        self.connected = False
        
        # Cache for performance
        self.users_cache = {}
        self.cache_timestamp = None
        self.cache_duration = timedelta(minutes=15)  # Cache for 15 minutes
        
    def connect_to_database(self) -> bool:
        """Connect to database"""
        self.connected = self.db.connect()
        return self.connected
    
    def verify_database_schema(self) -> Dict[str, Any]:
        """Verify that all required tables and columns exist"""
        verification_result = {
            'valid': True,
            'issues': [],
            'table_info': {}
        }
        
        required_tables = {
            'sample_users': ['usn', 'first_name', 'last_name', 'department', 'year'],
            'sample_user_skills': ['usn', 'skill_id', 'proficiency_level'],
            'sample_user_availability': ['usn', 'day_of_week', 'time_slot_start', 'time_slot_end', 'is_available'],
            'skills': ['skill_id', 'name']
        }
        
        try:
            if self.db.config['type'] == 'supabase':
                return self._verify_supabase_schema(required_tables)
            else:
                return self._verify_sql_schema(required_tables)
                
        except Exception as e:
            verification_result['valid'] = False
            verification_result['issues'].append(f"Schema verification failed: {e}")
            return verification_result
    
    def _verify_supabase_schema(self, required_tables: Dict[str, List[str]]) -> Dict[str, Any]:
        """Verify Supabase schema"""
        verification_result = {
            'valid': True,
            'issues': [],
            'table_info': {}
        }
        
        for table_name in required_tables.keys():
            try:
                # Test table access by trying to select one row
                result = self.db.connection.table(table_name).select('*').limit(1).execute()
                verification_result['table_info'][table_name] = {
                    'exists': True,
                    'row_count': len(result.data)
                }
            except Exception as e:
                verification_result['valid'] = False
                verification_result['issues'].append(f"Table {table_name} not accessible: {e}")
                verification_result['table_info'][table_name] = {'exists': False}
        
        return verification_result
    
    def _verify_sql_schema(self, required_tables: Dict[str, List[str]]) -> Dict[str, Any]:
        """Verify SQL schema for PostgreSQL/SQLAlchemy"""
        verification_result = {
            'valid': True,
            'issues': [],
            'table_info': {}
        }
        
        with self.db.get_connection() as conn:
            for table_name, required_columns in required_tables.items():
                try:
                    # Check if table exists and get column info
                    result = conn.execute(text(f"""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = '{table_name}'
                    """))
                    
                    existing_columns = [row[0] for row in result.fetchall()]
                    
                    if not existing_columns:
                        verification_result['valid'] = False
                        verification_result['issues'].append(f"Table {table_name} does not exist")
                        verification_result['table_info'][table_name] = {'exists': False}
                        continue
                    
                    missing_columns = [col for col in required_columns if col not in existing_columns]
                    if missing_columns:
                        verification_result['valid'] = False
                        verification_result['issues'].append(
                            f"Table {table_name} missing columns: {missing_columns}"
                        )
                    
                    # Get row count
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    row_count = count_result.scalar()
                    
                    verification_result['table_info'][table_name] = {
                        'exists': True,
                        'columns': existing_columns,
                        'missing_columns': missing_columns,
                        'row_count': row_count
                    }
                    
                except Exception as e:
                    verification_result['valid'] = False
                    verification_result['issues'].append(f"Error checking table {table_name}: {e}")
        
        return verification_result
    
    def get_database_statistics(self) -> Dict[str, Any]:
        """Get comprehensive database statistics"""
        stats = {
            'connected': self.connected,
            'database_type': self.db.config.get('type'),
            'tables': {}
        }
        
        if not self.connected:
            return stats
        
        table_names = ['sample_users', 'sample_user_skills', 'sample_user_availability', 'skills']
        
        try:
            if self.db.config['type'] == 'supabase':
                for table in table_names:
                    try:
                        result = self.db.connection.table(table).select('*', count='exact').execute()
                        stats['tables'][table] = {
                            'row_count': result.count,
                            'accessible': True
                        }
                    except Exception as e:
                        stats['tables'][table] = {
                            'row_count': 0,
                            'accessible': False,
                            'error': str(e)
                        }
            else:
                with self.db.get_connection() as conn:
                    for table in table_names:
                        try:
                            result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                            count = result.scalar()
                            stats['tables'][table] = {
                                'row_count': count,
                                'accessible': True
                            }
                        except Exception as e:
                            stats['tables'][table] = {
                                'row_count': 0,
                                'accessible': False,
                                'error': str(e)
                            }
        
        except Exception as e:
            stats['error'] = str(e)
        
        return stats
    
    def load_all_users(self, limit: Optional[int] = None) -> List[str]:
        """Load all available user USNs from database"""
        try:
            if self.db.config['type'] == 'supabase':
                query = self.db.connection.table('sample_users').select('usn')
                if limit:
                    query = query.limit(limit)
                result = query.execute()
                return [row['usn'] for row in result.data]
            else:
                query = "SELECT usn FROM sample_users"
                if limit:
                    query += f" LIMIT {limit}"
                    
                with self.db.get_connection() as conn:
                    result = conn.execute(text(query))
                    return [row[0] for row in result.fetchall()]
        
        except Exception as e:
            logger.error(f"Error loading user USNs: {e}")
            return []
    
    def load_user_profiles(self, user_ids: Optional[List[str]] = None, 
                          use_cache: bool = True, force_reload: bool = False) -> Dict:
        """
        Enhanced user profile loading with caching and performance optimization
        """
        # Check cache first
        if use_cache and not force_reload and self._is_cache_valid():
            if user_ids:
                return {uid: self.users_cache[uid] for uid in user_ids if uid in self.users_cache}
            return self.users_cache.copy()
        
        try:
            if self.db.config['type'] == 'supabase':
                users_data = self._load_from_supabase_enhanced(user_ids)
            else:
                users_data = self._load_from_sql_enhanced(user_ids)
            
            # Update cache
            if use_cache:
                if user_ids:
                    self.users_cache.update(users_data)
                else:
                    self.users_cache = users_data
                self.cache_timestamp = datetime.now()
            
            logger.info(f"Loaded {len(users_data)} user profiles from database")
            return users_data
            
        except Exception as e:
            logger.error(f"Error loading user profiles: {e}")
            return {}
    
    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self.cache_timestamp or not self.users_cache:
            return False
        return datetime.now() - self.cache_timestamp < self.cache_duration
    
    def _load_from_supabase_enhanced(self, user_ids: Optional[List[str]] = None) -> Dict:
        """Enhanced Supabase data loading with optimized queries"""
        users_data = {}
        
        try:
            # Load users with skills in a single query using joins
            users_query = self.db.connection.table('sample_users').select('''
                usn,
                first_name,
                last_name,
                department,
                year,
                sample_user_skills(
                    skill_id,
                    proficiency_level,
                    skills(
                        skill_id,
                        name
                    )
                )
            ''')
            
            if user_ids:
                users_query = users_query.in_('usn', user_ids)
            
            users_result = users_query.execute()
            
            # Load availability data
            availability_query = self.db.connection.table('sample_user_availability').select('*')
            if user_ids:
                availability_query = availability_query.in_('usn', user_ids)
            
            availability_result = availability_query.execute()
            
            # Process users and their skills
            for user in users_result.data:
                usn = user['usn']
                skills = []
                
                for user_skill in user.get('sample_user_skills', []):
                    if user_skill.get('skills'):
                        skills.append({
                            'skill_id': user_skill['skill_id'],
                            'skill_name': user_skill['skills']['name'],
                            'proficiency_level': user_skill['proficiency_level']
                        })
                
                users_data[usn] = {
                    'usn': usn,
                    'name': f"{user['first_name']} {user['last_name']}",
                    'first_name': user['first_name'],
                    'last_name': user['last_name'],
                    'department': user['department'],
                    'year': user['year'],
                    'skills': skills,
                    'schedule': self._initialize_empty_schedule(),
                    'total_available_slots': 0
                }
            
            # Process availability data
            availability_stats = {}
            for avail in availability_result.data:
                usn = avail['usn']
                
                if usn not in users_data:
                    continue
                
                day_num = avail['day_of_week']
                start_time = avail['time_slot_start']
                end_time = avail['time_slot_end']
                is_available = avail['is_available']
                
                if 0 <= day_num <= 6:
                    day_name = self.days[day_num]
                    time_slot = (start_time, end_time)
                    
                    if usn not in availability_stats:
                        availability_stats[usn] = {'available': 0, 'unavailable': 0}
                    
                    if is_available:
                        users_data[usn]['schedule'][day_name]['available'].add(time_slot)
                        users_data[usn]['schedule'][day_name]['valid'].add(time_slot)
                        availability_stats[usn]['available'] += 1
                    else:
                        users_data[usn]['schedule'][day_name]['avoid'].add(time_slot)
                        users_data[usn]['schedule'][day_name]['valid'].discard(time_slot)
                        availability_stats[usn]['unavailable'] += 1
            
            # Update total available slots
            for usn in users_data:
                total_slots = sum(
                    len(day_data['available']) 
                    for day_data in users_data[usn]['schedule'].values()
                )
                users_data[usn]['total_available_slots'] = total_slots
            
            return users_data
            
        except Exception as e:
            logger.error(f"Error loading from Supabase: {e}")
            raise
    
    def _load_from_sql_enhanced(self, user_ids: Optional[List[str]] = None) -> Dict:
        """Enhanced SQL data loading with optimized queries"""
        users_data = {}
        
        try:
            with self.db.get_connection() as conn:
                # Build user filter
                user_filter = ""
                user_params = {}
                
                if user_ids:
                    placeholders = ', '.join(f':user_{i}' for i in range(len(user_ids)))
                    user_filter = f"WHERE u.usn IN ({placeholders})"
                    user_params = {f'user_{i}': uid for i, uid in enumerate(user_ids)}
                
                # Optimized query to get users with their skills in one go
                users_skills_query = f"""
                SELECT 
                    u.usn,
                    u.first_name,
                    u.last_name,
                    u.department,
                    u.year,
                    us.skill_id,
                    s.name as skill_name,
                    us.proficiency_level
                FROM sample_users u
                LEFT JOIN sample_user_skills us ON u.usn = us.usn
                LEFT JOIN skills s ON us.skill_id = s.skill_id
                {user_filter}
                ORDER BY u.usn, us.skill_id
                """
                
                result = conn.execute(text(users_skills_query), user_params)
                
                # Process users and skills
                current_user = None
                for row in result:
                    usn = row.usn
                    
                    if current_user != usn:
                        users_data[usn] = {
                            'usn': usn,
                            'name': f"{row.first_name} {row.last_name}",
                            'first_name': row.first_name,
                            'last_name': row.last_name,
                            'department': row.department,
                            'year': row.year,
                            'skills': [],
                            'schedule': self._initialize_empty_schedule(),
                            'total_available_slots': 0
                        }
                        current_user = usn
                    
                    if row.skill_name:  # Only add if skill exists
                        users_data[usn]['skills'].append({
                            'skill_id': row.skill_id,
                            'skill_name': row.skill_name,
                            'proficiency_level': row.proficiency_level
                        })
                
                # Load availability data
                availability_filter = user_filter.replace('u.usn', 'usn') if user_filter else ''
                availability_query = f"""
                SELECT 
                    usn, 
                    day_of_week, 
                    time_slot_start, 
                    time_slot_end, 
                    is_available
                FROM sample_user_availability
                {availability_filter}
                ORDER BY usn, day_of_week, time_slot_start
                """
                
                availability_result = conn.execute(text(availability_query), user_params)
                
                # Process availability
                for row in availability_result:
                    usn = row.usn
                    
                    if usn not in users_data:
                        continue
                    
                    day_num = row.day_of_week
                    start_time = row.time_slot_start
                    end_time = row.time_slot_end
                    is_available = row.is_available
                    
                    if 0 <= day_num <= 6:
                        day_name = self.days[day_num]
                        
                        # Convert time objects to string format
                        if hasattr(start_time, 'strftime'):
                            start_str = start_time.strftime('%H:%M')
                            end_str = end_time.strftime('%H:%M')
                        else:
                            start_str = str(start_time)
                            end_str = str(end_time)
                        
                        time_slot = (start_str, end_str)
                        
                        if is_available:
                            users_data[usn]['schedule'][day_name]['available'].add(time_slot)
                            users_data[usn]['schedule'][day_name]['valid'].add(time_slot)
                        else:
                            users_data[usn]['schedule'][day_name]['avoid'].add(time_slot)
                            users_data[usn]['schedule'][day_name]['valid'].discard(time_slot)
                
                # Calculate total available slots for each user
                for usn in users_data:
                    total_slots = sum(
                        len(day_data['available']) 
                        for day_data in users_data[usn]['schedule'].values()
                    )
                    users_data[usn]['total_available_slots'] = total_slots
            
            return users_data
            
        except Exception as e:
            logger.error(f"Error loading from SQL database: {e}")
            raise
    
    def _initialize_empty_schedule(self) -> Dict:
        """Initialize empty schedule structure"""
        schedule = {}
        for day in self.days:
            schedule[day] = {
                'available': set(),
                'avoid': set(),
                'valid': set()
            }
        return schedule
    
    # ===========================================
    # ENHANCED API METHODS
    # ===========================================
    
    def get_user_profile(self, user_id: str) -> Optional[Dict]:
        """Get detailed profile for a specific user"""
        users_data = self.load_user_profiles([user_id])
        return users_data.get(user_id)
    
    def search_users_by_criteria(self, department: Optional[str] = None, 
                                year: Optional[int] = None, 
                                skills: Optional[List[str]] = None,
                                min_available_slots: int = 0) -> List[Dict]:
        """Search users by various criteria"""
        try:
            all_users = self.load_user_profiles()
            filtered_users = []
            
            for user_data in all_users.values():
                # Filter by department
                if department and user_data['department'].lower() != department.lower():
                    continue
                
                # Filter by year
                if year and user_data['year'] != year:
                    continue
                
                # Filter by skills
                if skills:
                    user_skills = [skill['skill_name'].lower() for skill in user_data['skills']]
                    if not any(skill.lower() in user_skills for skill in skills):
                        continue
                
                # Filter by minimum available slots
                if user_data['total_available_slots'] < min_available_slots:
                    continue
                
                filtered_users.append(user_data)
            
            return sorted(filtered_users, key=lambda x: x['total_available_slots'], reverse=True)
            
        except Exception as e:
            logger.error(f"Error searching users: {e}")
            return []
    
    def get_comprehensive_recommendations(self, user_id: str, 
                                        filters: Optional[Dict] = None,
                                        limit: int = 10) -> Dict:
        """Get comprehensive recommendations with filtering options"""
        try:
            # Load user profile
            user_profile = self.get_user_profile(user_id)
            if not user_profile:
                return {'success': False, 'error': 'User not found'}
            
            # Get all users as potential candidates
            all_users = self.load_user_profiles()
            candidate_ids = [uid for uid in all_users.keys() if uid != user_id]
            
            # Apply filters if provided
            if filters:
                department = filters.get('department')
                year = filters.get('year')
                skills = filters.get('skills', [])
                min_available_slots = filters.get('min_available_slots', 0)
                
                filtered_candidates = []
                for candidate_id in candidate_ids:
                    candidate = all_users[candidate_id]
                    
                    if department and candidate['department'].lower() != department.lower():
                        continue
                    if year and candidate['year'] != year:
                        continue
                    if skills:
                        candidate_skills = [s['skill_name'].lower() for s in candidate['skills']]
                        if not any(skill.lower() in candidate_skills for skill in skills):
                            continue
                    if candidate['total_available_slots'] < min_available_slots:
                        continue
                    
                    filtered_candidates.append(candidate_id)
                
                candidate_ids = filtered_candidates
            
            # Get recommendations
            recommendations = self.get_profile_recommendations(
                user_id, 
                candidate_ids,
                min_match_threshold=filters.get('min_match_threshold', 10.0) if filters else 10.0
            )
            
            return {
                'success': True,
                'user_profile': user_profile,
                'recommendations': recommendations[:limit],
                'total_candidates_considered': len(candidate_ids),
                'filters_applied': filters or {},
                'returned_count': len(recommendations[:limit])
            }
            
        except Exception as e:
            logger.error(f"Error getting comprehensive recommendations: {e}")
            return {'success': False, 'error': str(e)}
    
    # ===========================================
    # ORIGINAL MATCHING METHODS (Enhanced)
    # ===========================================
    
    def normalize_usn(self, raw_usn: str) -> str:
        """Normalize USN by stripping spaces and uppercasing."""
        if raw_usn is None:
            return ''
        return str(raw_usn).strip().upper()
    
    def is_valid_usn(self, usn: str) -> bool:
        """Validate USN format: 1KG22AD001 (1 + 2 letters + 2 digits + 2 letters + 3 digits)."""
        import re
        if not usn:
            return False
        return re.match(r'^1[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$', usn) is not None
    
    def calculate_schedule_match_percentage(self, user1_id: str, user2_id: str, 
                                          preferred_days: List[str] = None) -> Dict:
        """Calculate schedule match percentage between two users"""
        
        # Normalize and validate USNs
        user1_norm = self.normalize_usn(user1_id)
        user2_norm = self.normalize_usn(user2_id)
        if not self.is_valid_usn(user1_norm) or not self.is_valid_usn(user2_norm):
            return {
                'error': 'Invalid USN format. Expected like 1KG22AD001',
                'match_percentage': 0,
                'common_slots': 0
            }
        
        # Load user data (bypass cache to ensure fresh fetch for specific USNs)
        users_data = self.load_user_profiles([user1_norm, user2_norm], use_cache=False, force_reload=True)
        
        if user1_norm not in users_data or user2_norm not in users_data:
            return {
                'error': 'One or both users not found',
                'match_percentage': 0,
                'common_slots': 0,
                'users_found': {
                    'user1': user1_norm in users_data,
                    'user2': user2_norm in users_data
                }
            }
        
        if preferred_days is None:
            preferred_days = self.days
        
        total_possible_slots = 0
        common_slots = 0
        day_breakdown = {}
        
        for day in preferred_days:
            user1_available = users_data[user1_norm]['schedule'][day]['available']
            user2_available = users_data[user2_norm]['schedule'][day]['available']
            
            # Find exact matching slots
            exact_matches = user1_available.intersection(user2_available)
            day_common = len(exact_matches)
            
            # Check for overlapping slots (partial matches)
            overlapping_matches = 0
            for slot1 in user1_available:
                for slot2 in user2_available:
                    if slot1 != slot2 and self.get_overlapping_slots(slot1, slot2):
                        overlapping_matches += 0.5  # Partial credit
                        break
            
            day_common += overlapping_matches
            day_total = len(self.time_slots)
            
            day_breakdown[day] = {
                'common_slots': round(day_common, 1),
                'total_possible': day_total,
                'day_percentage': (day_common / day_total * 100) if day_total > 0 else 0,
                'user1_available': len(user1_available),
                'user2_available': len(user2_available),
                'exact_matches': len(exact_matches),
                'overlapping_matches': round(overlapping_matches, 1)
            }
            
            common_slots += day_common
            total_possible_slots += day_total
        
        match_percentage = (common_slots / total_possible_slots * 100) if total_possible_slots > 0 else 0
        meeting_potential = self._calculate_meeting_potential(day_breakdown)
        
        return {
            'match_percentage': round(match_percentage, 1),
            'common_slots': round(common_slots, 1),
            'total_possible_slots': total_possible_slots,
            'day_breakdown': day_breakdown,
            'meeting_potential': round(meeting_potential, 1),
            'recommendation_score': round(self._calculate_recommendation_score(match_percentage, meeting_potential), 1),
            'users_found': True
        }

    def format_schedule_match(self, match_result: Dict) -> str:
        """Pretty print the schedule match result for CLI output"""
        if not isinstance(match_result, dict) or match_result.get('error'):
            return f"Error: {match_result.get('error', 'Unknown error')}"
        lines = []
        lines.append(f"Match: {match_result['match_percentage']}%  |  Common slots: {match_result['common_slots']} / {match_result['total_possible_slots']}")
        lines.append(f"Meeting potential score: {match_result['meeting_potential']}")
        lines.append("")
        lines.append("Day-wise breakdown:")
        for day in ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']:
            if day in match_result['day_breakdown']:
                d = match_result['day_breakdown'][day]
                lines.append(
                    f"  - {day.capitalize():10} | common: {d['common_slots']:<4} total: {d['total_possible']:<2} "
                    f"| day%: {d['day_percentage']:<5.1f} | u1: {d['user1_available']:<2} u2: {d['user2_available']:<2} "
                    f"| exact: {d['exact_matches']:<2} overlap: {d['overlapping_matches']}"
                )
        return "\n".join(lines)
    
    def get_overlapping_slots(self, slot1: Tuple[str, str], slot2: Tuple[str, str]) -> bool:
        """Check if two time slots overlap"""
        start1, end1 = slot1
        start2, end2 = slot2
        
        def time_to_minutes(time_str):
            if isinstance(time_str, str):
                parts = time_str.split(':')
            else:
                # Handle time objects
                parts = [str(time_str.hour), str(time_str.minute)]
            hours = int(parts[0]) if len(parts) > 0 else 0
            minutes = int(parts[1]) if len(parts) > 1 else 0
            return hours * 60 + minutes
        
        start1_min = time_to_minutes(start1)
        end1_min = time_to_minutes(end1)
        start2_min = time_to_minutes(start2)
        end2_min = time_to_minutes(end2)
        
        # Handle midnight crossover
        if end1_min <= start1_min:
            end1_min += 24 * 60
        if end2_min <= start2_min:
            end2_min += 24 * 60
        
        return not (end1_min <= start2_min or end2_min <= start1_min)
    
    def get_profile_recommendations(self, user_id: str, candidate_ids: List[str], 
                                  preferred_days: List[str] = None, 
                                  min_match_threshold: float = 10.0) -> List[Dict]:
        """Get recommended profiles based on schedule compatibility"""
        
        recommendations = []
        
        # Normalize and validate IDs
        user_id_norm = self.normalize_usn(user_id)
        candidates_norm = [self.normalize_usn(cid) for cid in candidate_ids if self.is_valid_usn(self.normalize_usn(cid))]
        
        if not self.is_valid_usn(user_id_norm):
            return [{'error': 'Invalid user_id format. Expected like 1KG22AD001'}]
        
        # Load all required user data
        all_user_ids = [user_id_norm] + candidates_norm
        users_data = self.load_user_profiles(all_user_ids)
        
        if user_id_norm not in users_data:
            return [{'error': 'User not found'}]
        
        for candidate_id in candidates_norm:
            if candidate_id == user_id_norm or candidate_id not in users_data:
                continue
            
            # Calculate schedule match
            match_result = self.calculate_schedule_match_percentage(
                user_id_norm, candidate_id, preferred_days
            )
            
            if match_result.get('match_percentage', 0) >= min_match_threshold:
                candidate_data = users_data[candidate_id]
                
                # Extract top days by day_percentage for quick insight
                day_items = match_result.get('day_breakdown', {}).items()
                top_days = sorted(
                    ((day, info['day_percentage']) for day, info in day_items),
                    key=lambda x: x[1], reverse=True
                )[:3]

                recommendations.append({
                    'user_id': candidate_id,
                    'name': candidate_data['name'],
                    'first_name': candidate_data['first_name'],
                    'last_name': candidate_data['last_name'],
                    'department': candidate_data['department'],
                    'year': candidate_data['year'],
                    'skills': candidate_data['skills'],
                    'total_available_slots': candidate_data['total_available_slots'],
                    'schedule_match': match_result,
                    'recommendation_priority': match_result.get('recommendation_score', match_result.get('match_percentage', 0)),
                    'best_days': [{ 'day': d.capitalize(), 'day_percentage': round(p,1) } for d, p in top_days]
                })
        
        # Sort by recommendation score (descending)
        recommendations.sort(key=lambda x: x['recommendation_priority'], reverse=True)
        
        return recommendations
    
    def find_optimal_teams(self, team_size: int = 3, 
                          preferred_days: List[str] = None,
                          min_team_score: float = 20.0,
                          max_teams: int = 10) -> Dict:
        """Find optimal team formations based on schedule compatibility"""
        
        if team_size < 2:
            return {'error': 'Team size must be at least 2'}
        
        # Load all users
        all_users = self.load_all_users()
        if len(all_users) < team_size:
            return {'error': f'Not enough users. Need {team_size}, have {len(all_users)}'}
        
        # Load all user profiles
        users_data = self.load_user_profiles(all_users, use_cache=False, force_reload=True)
        
        # Filter users with some availability (but allow some flexibility)
        available_users = {uid: data for uid, data in users_data.items() 
                          if data['total_available_slots'] >= 0}  # Allow users with 0 slots for now
        
        if len(available_users) < team_size:
            return {'error': f'Not enough users. Need {team_size}, have {len(available_users)}'}
        
        # Generate all possible team combinations
        from itertools import combinations
        team_combinations = list(combinations(available_users.keys(), team_size))
        
        if len(team_combinations) > 1000:  # Limit for performance
            team_combinations = team_combinations[:1000]
        
        # Score each team combination
        team_scores = []
        for team_ids in team_combinations:
            team_score = self._calculate_team_compatibility_score(list(team_ids), users_data, preferred_days)
            if team_score['overall_score'] >= min_team_score:
                team_scores.append({
                    'team_ids': list(team_ids),
                    'team_names': [users_data[uid]['name'] for uid in team_ids],
                    'score': team_score
                })
        
        # Sort by overall score (descending)
        team_scores.sort(key=lambda x: x['score']['overall_score'], reverse=True)
        
        # Get meeting slots for top teams
        top_teams = []
        for team_data in team_scores[:max_teams]:
            meeting_slots = self.find_team_meeting_slots(
                team_data['team_ids'], 
                preferred_days, 
                min_duration_hours=2
            )
            
            if 'error' not in meeting_slots:
                top_teams.append({
                    'team_info': team_data,
                    'meeting_slots': meeting_slots
                })
        
        return {
            'success': True,
            'total_combinations_evaluated': len(team_combinations),
            'teams_found': len(top_teams),
            'top_teams': top_teams,
            'criteria': {
                'team_size': team_size,
                'min_team_score': min_team_score,
                'preferred_days': preferred_days or self.days
            }
        }
    
    def _calculate_team_compatibility_score(self, team_ids: List[str], 
                                          users_data: Dict, 
                                          preferred_days: List[str] = None) -> Dict:
        """Calculate compatibility score for a team"""
        
        if preferred_days is None:
            preferred_days = self.days
        
        # Calculate pairwise compatibility scores
        pairwise_scores = []
        for i in range(len(team_ids)):
            for j in range(i + 1, len(team_ids)):
                user1, user2 = team_ids[i], team_ids[j]
                match_result = self.calculate_schedule_match_percentage(user1, user2, preferred_days)
                if 'error' not in match_result:
                    pairwise_scores.append(match_result['match_percentage'])
        
        if not pairwise_scores:
            return {'overall_score': 0, 'pairwise_scores': [], 'meeting_potential': 0}
        
        # Calculate team metrics
        avg_pairwise_score = sum(pairwise_scores) / len(pairwise_scores)
        min_pairwise_score = min(pairwise_scores)
        max_pairwise_score = max(pairwise_scores)
        
        # Calculate team availability diversity
        team_availability = [users_data[uid]['total_available_slots'] for uid in team_ids]
        availability_variance = max(team_availability) - min(team_availability)
        
        # Heavy penalty for users with 0 availability
        zero_availability_penalty = sum(1 for slots in team_availability if slots == 0) * 15.0
        availability_penalty = min(availability_variance / 10.0, 10.0) + zero_availability_penalty
        
        # Calculate overall team score
        overall_score = (avg_pairwise_score * 0.6 + 
                        min_pairwise_score * 0.3 + 
                        max_pairwise_score * 0.1 - 
                        availability_penalty)
        
        return {
            'overall_score': round(overall_score, 1),
            'avg_pairwise_score': round(avg_pairwise_score, 1),
            'min_pairwise_score': round(min_pairwise_score, 1),
            'max_pairwise_score': round(max_pairwise_score, 1),
            'pairwise_scores': [round(score, 1) for score in pairwise_scores],
            'availability_variance': round(availability_variance, 1),
            'availability_penalty': round(availability_penalty, 1),
            'zero_availability_penalty': round(zero_availability_penalty, 1),
            'meeting_potential': round(overall_score, 1)
        }
    
    def find_team_meeting_slots(self, team_member_ids: List[str], 
                               preferred_days: List[str] = None,
                               min_duration_hours: int = 2) -> Dict:
        """Find available meeting slots for a formed team"""
        
        if len(team_member_ids) < 2:
            return {'error': 'Need at least 2 team members'}
        
        # Normalize and validate team member IDs
        valid_ids = [self.normalize_usn(uid) for uid in team_member_ids if self.is_valid_usn(self.normalize_usn(uid))]
        
        if len(valid_ids) < 2:
            return {'error': 'Need at least 2 valid team member IDs'}
        
        # Load team data (force reload to ensure fresh data)
        users_data = self.load_user_profiles(valid_ids, use_cache=False, force_reload=True)
        
        missing_users = [uid for uid in valid_ids if uid not in users_data]
        if missing_users:
            return {'error': f'Users not found: {missing_users}'}
        
        if preferred_days is None:
            preferred_days = self.days
        
        perfect_slots = []
        good_slots = []
        backup_slots = []
        day_statistics = {}
        
        for day in preferred_days:
            day_perfect = 0
            day_good = 0
            day_backup = 0
            
            # Check each standard time slot
            for time_slot in self.time_slots:
                available_members = []
                
                for member_id in valid_ids:
                    member_schedule = users_data[member_id]['schedule'][day]['available']
                    
                    # Check if this exact slot or any overlapping slot is available
                    is_available = False
                    if time_slot in member_schedule:
                        is_available = True
                    else:
                        # Check for overlapping custom slots
                        for member_slot in member_schedule:
                            if self.get_overlapping_slots(time_slot, member_slot):
                                is_available = True
                                break
                    
                    if is_available:
                        available_members.append(member_id)
                
                availability_percentage = (len(available_members) / len(valid_ids)) * 100
                
                slot_info = {
                    'day': day.capitalize(),
                    'time_slot': f"{time_slot[0]} - {time_slot[1]}",
                    'start_time': time_slot[0],
                    'end_time': time_slot[1],
                    'availability_percentage': round(availability_percentage, 1),
                    'available_members': len(available_members),
                    'total_members': len(valid_ids),
                    'available_member_names': [users_data[uid]['name'] for uid in available_members],
                    'available_member_ids': available_members,
                    'unavailable_member_names': [users_data[uid]['name'] 
                                               for uid in valid_ids if uid not in available_members]
                }
                
                if availability_percentage == 100:
                    perfect_slots.append(slot_info)
                    day_perfect += 1
                elif availability_percentage >= 80:
                    good_slots.append(slot_info)
                    day_good += 1
                elif availability_percentage >= 50:
                    backup_slots.append(slot_info)
                    day_backup += 1
            
            day_statistics[day] = {
                'perfect_slots': day_perfect,
                'good_slots': day_good,
                'backup_slots': day_backup,
                'total_viable_slots': day_perfect + day_good + day_backup
            }
        
        # Calculate overall statistics
        total_perfect = len(perfect_slots)
        total_good = len(good_slots)
        total_backup = len(backup_slots)
        total_checked = len(preferred_days) * len(self.time_slots)
        
        success_rate = ((total_perfect + total_good) / total_checked * 100) if total_checked > 0 else 0
        
        # Enhanced fallback recommendations
        fallback_recommendations = self._generate_fallback_recommendations(
            perfect_slots, good_slots, backup_slots, day_statistics, valid_ids, users_data
        )
        
        return {
            'team_info': {
                'member_ids': valid_ids,
                'member_names': [users_data[uid]['name'] for uid in valid_ids],
                'team_size': len(valid_ids)
            },
            'perfect_slots': perfect_slots[:20],  # Top 20 perfect slots
            'good_slots': good_slots[:15],        # Top 15 good slots
            'backup_slots': backup_slots[:10],    # Top 10 backup slots
            'fallback_recommendations': fallback_recommendations,
            'statistics': {
                'total_perfect_slots': total_perfect,
                'total_good_slots': total_good,
                'total_backup_slots': total_backup,
                'success_rate': round(success_rate, 1),
                'day_breakdown': day_statistics,
                'recommendation': self._get_meeting_recommendation(total_perfect, total_good, total_backup)
            }
        }
    
    # ===========================================
    # UTILITY METHODS
    # ===========================================
    
    def _calculate_meeting_potential(self, day_breakdown: Dict) -> float:
        """Calculate meeting potential score based on day distribution"""
        total_score = 0
        total_days = len(day_breakdown)
        
        for day_data in day_breakdown.values():
            day_score = day_data['day_percentage']
            # Bonus for multiple slots per day
            if day_data['common_slots'] >= 3:
                day_score *= 1.2
            total_score += day_score
        
        return total_score / total_days if total_days > 0 else 0
    
    def _calculate_recommendation_score(self, match_percentage: float, meeting_potential: float) -> float:
        """Calculate overall recommendation score"""
        return (match_percentage * 0.6) + (meeting_potential * 0.4)
    
    def _generate_fallback_recommendations(self, perfect_slots: List, good_slots: List, 
                                         backup_slots: List, day_statistics: Dict,
                                         team_ids: List[str], users_data: Dict) -> Dict:
        """Generate intelligent fallback recommendations when no perfect slots are available"""
        
        recommendations = {
            'alternative_strategies': [],
            'best_available_slots': [],
            'team_optimization_suggestions': [],
            'schedule_adjustment_tips': []
        }
        
        # Strategy 1: Best available slots (even if not perfect)
        all_available_slots = perfect_slots + good_slots + backup_slots
        if all_available_slots:
            # Sort by availability percentage
            sorted_slots = sorted(all_available_slots, 
                                key=lambda x: x['availability_percentage'], reverse=True)
            recommendations['best_available_slots'] = sorted_slots[:5]
            
            # Add strategy recommendation
            best_slot = sorted_slots[0]
            recommendations['alternative_strategies'].append({
                'strategy': 'Use best available slot',
                'description': f"Schedule meeting on {best_slot['day']} {best_slot['time_slot']} with {best_slot['availability_percentage']}% team availability",
                'confidence': 'High' if best_slot['availability_percentage'] >= 80 else 'Medium'
            })
        
        # Strategy 2: Find days with most team availability
        best_days = []
        for day, stats in day_statistics.items():
            if stats['total_viable_slots'] > 0:
                best_days.append((day, stats['total_viable_slots']))
        
        best_days.sort(key=lambda x: x[1], reverse=True)
        if best_days:
            recommendations['alternative_strategies'].append({
                'strategy': 'Focus on high-availability days',
                'description': f"Best days for meetings: {', '.join([day.capitalize() for day, _ in best_days[:3]])}",
                'confidence': 'High'
            })
        
        # Strategy 3: Team optimization suggestions
        team_availability = [users_data[uid]['total_available_slots'] for uid in team_ids]
        min_availability = min(team_availability)
        max_availability = max(team_availability)
        
        if max_availability - min_availability > 10:
            least_available_user = min(team_ids, key=lambda uid: users_data[uid]['total_available_slots'])
            recommendations['team_optimization_suggestions'].append({
                'suggestion': 'Consider team member with limited availability',
                'description': f"{users_data[least_available_user]['name']} has only {min_availability} available slots",
                'action': 'Ask if they can increase availability or consider alternative team member'
            })
        
        # Strategy 4: Schedule adjustment tips
        if not perfect_slots and not good_slots:
            recommendations['schedule_adjustment_tips'].extend([
                {
                    'tip': 'Extend meeting duration',
                    'description': 'Consider shorter meetings (1 hour instead of 2) to increase available slots'
                },
                {
                    'tip': 'Flexible timing',
                    'description': 'Allow team members to join late or leave early for partial participation'
                },
                {
                    'tip': 'Alternative communication',
                    'description': 'Use asynchronous communication for non-critical discussions'
                }
            ])
        
        return recommendations
    
    def _get_meeting_recommendation(self, perfect: int, good: int, backup: int) -> str:
        """Generate meeting recommendation based on available slots"""
        if perfect >= 10:
            return "Excellent - Many perfect meeting times available"
        elif perfect >= 5:
            return "Very Good - Several perfect meeting times available"
        elif perfect >= 2:
            return "Good - Some perfect meeting times available"
        elif perfect >= 1 or good >= 5:
            return "Fair - Limited perfect slots but good alternatives available"
        elif good >= 2 or backup >= 5:
            return "Challenging - Few good meeting opportunities"
        else:
            return "Difficult - Very limited meeting opportunities"
    
    # ===========================================
    # API ENDPOINTS
    # ===========================================
    
    def api_get_profile_recommendations(self, user_id: str, params: Dict) -> Dict:
        """API endpoint for getting profile recommendations"""
        try:
            candidate_ids = params.get('candidate_ids', [])
            preferred_days = params.get('preferred_days', self.days)
            min_threshold = params.get('min_match_threshold', 10.0)
            limit = params.get('limit', 10)
            
            # If no candidate_ids provided, get all users except the requesting user
            if not candidate_ids:
                all_users = self.load_all_users()
                candidate_ids = [uid for uid in all_users if uid != self.normalize_usn(user_id)]
            
            recommendations = self.get_profile_recommendations(
                user_id, candidate_ids, preferred_days, min_threshold
            )
            
            return {
                'success': True,
                'data': recommendations[:limit],
                'total_candidates': len(candidate_ids),
                'returned_recommendations': len(recommendations[:limit]),
                'request_params': {
                    'user_id': user_id,
                    'min_threshold': min_threshold,
                    'preferred_days': preferred_days,
                    'limit': limit
                }
            }
        except Exception as e:
            logger.error(f"API recommendation error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def api_get_team_meeting_slots(self, params: Dict) -> Dict:
        """API endpoint for getting team meeting slots"""
        try:
            team_ids = params.get('team_member_ids', [])
            preferred_days = params.get('preferred_days', self.days)
            min_duration = params.get('min_duration_hours', 2)
            
            result = self.find_team_meeting_slots(team_ids, preferred_days, min_duration)
            
            if 'error' in result:
                return {
                    'success': False,
                    'error': result['error']
                }
            
            return {
                'success': True,
                'data': result,
                'request_params': {
                    'team_member_ids': team_ids,
                    'preferred_days': preferred_days,
                    'min_duration_hours': min_duration
                }
            }
        except Exception as e:
            logger.error(f"API team meeting error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def api_get_database_stats(self) -> Dict:
        """API endpoint for getting database statistics"""
        try:
            schema_verification = self.verify_database_schema()
            db_stats = self.get_database_statistics()
            
            return {
                'success': True,
                'data': {
                    'schema_verification': schema_verification,
                    'database_statistics': db_stats,
                    'connection_info': {
                        'connected': self.connected,
                        'database_type': self.db.config.get('type'),
                        'cache_valid': self._is_cache_valid(),
                        'cached_users': len(self.users_cache)
                    }
                }
            }
        except Exception as e:
            logger.error(f"API database stats error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def close_connection(self):
        """Close database connection and cleanup"""
        if self.db:
            self.db.close()
        self.connected = False
        self.users_cache.clear()
        self.cache_timestamp = None
        logger.info("Database connection closed and cache cleared")


# ===========================================
# USAGE EXAMPLES AND TESTING
# ===========================================

def test_enhanced_matcher():
    """Comprehensive test of the enhanced matcher"""
    
    try:
        # Create configuration using secrets
        supabase_config = DatabaseConfig.create_config_from_secrets('supabase')
    except ValueError as e:
        print(f"Error: {e}")
        print("Please create secrets.py from secrets.example.py and fill in your values")
        return
    
    # Initialize matcher
    matcher = EnhancedWebScheduleMatcher(supabase_config)
    
    try:
        # Test connection
        print("=== Connection ===")
        if not matcher.connect_to_database():
            print("Failed to connect to Supabase")
            return
        else:
            print("Connected to Supabase")
        
        # Test schema verification
        print("\n=== Schema ===")
        schema_result = matcher.verify_database_schema()
        print(f"Valid: {schema_result['valid']}")
        if schema_result['issues']:
            print(f"Issues: {schema_result['issues']}")
        
        # Test database statistics
        print("\n=== Stats ===")
        db_stats = matcher.get_database_statistics()
        print(json.dumps(db_stats, indent=2))
        
        # Load all available users
        print("\n=== Users ===")
        all_users = matcher.load_all_users(limit=10)
        print(f"Loaded {len(all_users)} users")
        
        if len(all_users) >= 2:
            # Test user profile loading
            print(f"\n=== Profiles ===")
            # Load a broader set so specific USNs like 052 are present
            user_profiles = matcher.load_user_profiles(all_users, use_cache=False, force_reload=True)
            print(f"Loaded {len(user_profiles)} profiles")
            
            for usn, profile in user_profiles.items():
                print(f"{usn}: {profile['name']} - {profile['total_available_slots']} available slots")
            
            # Test recommendations using the updated comprehensive method
            print(f"\n=== Recommendations ===")
            user_id = all_users[0]
            filters = {
                'department': None,
                'year': None,
                'skills': [],
                'min_available_slots': 0
            }
            rec_result = matcher.get_comprehensive_recommendations(
                user_id=user_id,
                filters=filters,
                limit=5
            )
            if not rec_result.get('success'):
                print(f"Recommendations error: {rec_result.get('error')}")
            else:
                recommendations = rec_result.get('data', [])
                print(f"Recommendations for {user_id}:")
                for i, rec in enumerate(recommendations[:5]):
                    print(f"  {i+1}. {rec['name']} ({rec['user_id']})  |  Match: {rec['schedule_match'].get('match_percentage', 0)}%")
                    if rec.get('best_days'):
                        best = ", ".join([f"{d['day']} {d['day_percentage']}%" for d in rec['best_days']])
                        print(f"     Best days: {best}")
            
            # Test schedule matching between first two users
            if len(all_users) >= 2:
                print(f"\n=== Schedule Match Test ===")
                user1 = all_users[0]
                user2 = all_users[1]
                if hasattr(matcher, 'calculate_schedule_match_percentage'):
                    match_result = matcher.calculate_schedule_match_percentage(user1, user2)
                    print(f"Schedule match between {user1} and {user2}:")
                    if isinstance(match_result, dict) and 'error' in match_result:
                        print(f"  Error: {match_result['error']}")
                    else:
                        # Pretty print
                        print(matcher.format_schedule_match(match_result))
                else:
                    print("Schedule match method not available - skipping")
            
            # Test optimal team formation
            if len(all_users) >= 3:
                print(f"\n=== Optimal Teams ===")
                optimal_result = matcher.find_optimal_teams(
                    team_size=3,
                    preferred_days=['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    min_team_score=15.0,
                    max_teams=3
                )
                
                if 'error' in optimal_result:
                    print(f"Error: {optimal_result['error']}")
                else:
                    print(f"Found {optimal_result['teams_found']} optimal teams from {optimal_result['total_combinations_evaluated']} combinations")
                    
                    for i, team_data in enumerate(optimal_result['top_teams'][:2]):
                        team_info = team_data['team_info']
                        meeting_slots = team_data['meeting_slots']
                        score = team_info['score']
                        
                        print(f"\nTeam {i+1}: {', '.join(team_info['team_names'])}")
                        print(f"  Compatibility Score: {score['overall_score']}")
                        print(f"  Avg Pairwise Match: {score['avg_pairwise_score']}%")
                        
                        if 'statistics' in meeting_slots:
                            stats = meeting_slots['statistics']
                            print(f"  Meeting Slots: Perfect={stats['total_perfect_slots']}, Good={stats['total_good_slots']}, Backup={stats['total_backup_slots']}")
                            print(f"  Success Rate: {stats['success_rate']}%")
                            print(f"  Recommendation: {stats['recommendation']}")
                            
                            # Show fallback recommendations
                            if 'fallback_recommendations' in meeting_slots:
                                fallback = meeting_slots['fallback_recommendations']
                                if fallback['alternative_strategies']:
                                    print("  Alternative strategies:")
                                    for strategy in fallback['alternative_strategies'][:2]:
                                        print(f"    - {strategy['strategy']}: {strategy['description']}")
            
            # Test team meeting slots for a specific team
            if len(all_users) >= 3:
                print(f"\n=== Team Slots (Specific Team) ===")
                # Use the first 3 users from the loaded profiles to ensure they exist
                team_ids = list(user_profiles.keys())[:3]
                
                meeting_result = matcher.find_team_meeting_slots(
                    team_member_ids=team_ids,
                    preferred_days=['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    min_duration_hours=2
                )
                
                print(f"Team meeting slots for {team_ids}:")
                if 'error' in meeting_result:
                    print(f"Error: {meeting_result['error']}")
                else:
                    stats = meeting_result['statistics']
                    print(f"Perfect slots: {stats['total_perfect_slots']}")
                    print(f"Good slots: {stats['total_good_slots']}")
                    print(f"Success rate: {stats['success_rate']}%")
                    print(f"Recommendation: {stats['recommendation']}")
                    
                    # Show some perfect slots if available
                    if meeting_result['perfect_slots']:
                        print("Perfect meeting times:")
                        for slot in meeting_result['perfect_slots'][:3]:
                            print(f"  {slot['day']} {slot['time_slot']} - {slot['availability_percentage']}% available")
                    
                    # Show fallback recommendations
                    if 'fallback_recommendations' in meeting_result:
                        fallback = meeting_result['fallback_recommendations']
                        if fallback['alternative_strategies']:
                            print("Alternative strategies:")
                            for strategy in fallback['alternative_strategies'][:2]:
                                print(f"  - {strategy['strategy']}: {strategy['description']}")
            
            # Test search functionality - using correct method names from your class
            print(f"\n=== Testing User Search ===")
            if hasattr(matcher, 'search_users_by_criteria'):
                search_results = matcher.search_users_by_criteria(
                    department="Artificial Intelligence and Data Science",
                    min_available_slots=1
                )
                print(f"Found {len(search_results)} users matching criteria")
                for user in search_results[:3]:  # Show first 3
                    print(f"  {user['name']} - {user['total_available_slots']} slots")
            else:
                print("Search method not available - skipping search test")
            
            # Test getting individual user profile
            print(f"\n=== Testing Individual User Profile ===")
            if hasattr(matcher, 'get_user_profile'):
                user_profile = matcher.get_user_profile(all_users[0])
                if user_profile:
                    print(f"Profile for {user_profile['usn']}:")
                    print(f"  Name: {user_profile['name']}")
                    print(f"  Department: {user_profile['department']}")
                    print(f"  Year: {user_profile['year']}")
                    print(f"  Available slots: {user_profile['total_available_slots']}")
                    print(f"  Skills: {len(user_profile['skills'])} skills")
                else:
                    print("No profile found")
            else:
                print("get_user_profile method not available")
            
        else:
            print("Not enough users in database for comprehensive testing")
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Cleanup using the database connector's close method
        if hasattr(matcher, 'db') and matcher.db:
            matcher.db.close()
        matcher.connected = False
        if hasattr(matcher, 'users_cache'):
            matcher.users_cache.clear()
        print("\n=== Test Complete ===")


def create_matcher_from_secrets(db_type: str = 'supabase') -> EnhancedWebScheduleMatcher:
    """Helper function to create a matcher using secrets configuration"""
    try:
        config = DatabaseConfig.create_config_from_secrets(db_type)
        return EnhancedWebScheduleMatcher(config)
    except ValueError as e:
        print(f"Error creating matcher: {e}")
        print("Please ensure secrets.py is properly configured")
        return None


def interactive_teammate_finder():
    """
    Interactive CLI for finding teammates based on schedule compatibility.
    Allows user to input their USN and desired team size, then finds best matches.
    """
    print("\n" + "="*60)
    print("   SCHOLARX - Interactive Teammate Finder")
    print("="*60)
    
    # Initialize matcher
    try:
        config = DatabaseConfig.create_config_from_secrets('supabase')
        matcher = EnhancedWebScheduleMatcher(config)
    except ValueError as e:
        print(f"\n[ERROR] {e}")
        print("Please create secrets.py from secrets.example.py and configure it.")
        return
    
    if not matcher.connect_to_database():
        print("\n[ERROR] Failed to connect to database")
        return
    
    try:
        # Load all available users
        print("\n[*] Loading user database...")
        all_users = matcher.load_all_users()
        
        if not all_users:
            print("[ERROR] No users found in database")
            return
        
        print(f"[OK] Found {len(all_users)} users in database\n")
        
        # Get user's USN
        while True:
            user_usn = input("Enter your USN (e.g., 1KG24CB009): ").strip().upper()
            
            if not user_usn:
                print("[ERROR] USN cannot be empty. Please try again.\n")
                continue
            
            # Normalize and validate
            normalized_usn = matcher.normalize_usn(user_usn)
            
            if not matcher.is_valid_usn(normalized_usn):
                print(f"[ERROR] Invalid USN format: {user_usn}")
                print("   Expected format: 1KG24CB009 (1 + KG + 2-digit year + 2-letter dept + 3-digit number)\n")
                continue
            
            # Check if user exists
            if normalized_usn not in all_users:
                print(f"[ERROR] USN {normalized_usn} not found in database")
                print(f"   Available USNs (first 10): {', '.join(all_users[:10])}...\n")
                retry = input("Would you like to try another USN? (y/n): ").strip().lower()
                if retry != 'y':
                    return
                continue
            
            user_usn = normalized_usn
            break
        
        # Load user profile
        print(f"\n[*] Loading profile for {user_usn}...")
        user_profile = matcher.get_user_profile(user_usn)
        
        if not user_profile:
            print(f"[ERROR] Could not load profile for {user_usn}")
            return
        
        print(f"\n[USER PROFILE]:")
        print(f"   Name: {user_profile['name']}")
        print(f"   Department: {user_profile['department']}")
        print(f"   Year: {user_profile['year']}")
        print(f"   Available Time Slots: {user_profile['total_available_slots']}")
        print(f"   Skills: {len(user_profile['skills'])} skills")
        
        # Check if user has any availability
        if user_profile['total_available_slots'] == 0:
            print("\n[WARNING] You have 0 available time slots in your profile!")
            print("   This will make it very difficult to find matching teammates.")
            print("\n[TIP] Recommendation: Please add your available time slots to your profile first.")
            print("   You can still continue, but matches will be limited.\n")
            
            cont = input("Continue anyway? (y/n): ").strip().lower()
            if cont != 'y':
                return
        
        # Get desired team size
        print("\n" + "-"*60)
        while True:
            try:
                team_size_input = input("How many teammates do you want? (1-10): ").strip()
                team_size = int(team_size_input)
                
                if team_size < 1:
                    print("[ERROR] Team size must be at least 1\n")
                    continue
                elif team_size > 10:
                    print("[ERROR] Team size cannot exceed 10\n")
                    continue
                elif team_size >= len(all_users):
                    print(f"[ERROR] Not enough users. Maximum team size: {len(all_users) - 1}\n")
                    continue
                
                break
            except ValueError:
                print("[ERROR] Please enter a valid number\n")
        
        total_team_size = team_size + 1  # Including the user
        print(f"\n[*] Searching for {team_size} teammate(s) (total team size: {total_team_size})...")
        
        # Get candidate users (exclude the user themselves)
        candidate_users = [u for u in all_users if u != user_usn]
        
        # Get recommendations
        print(f"   Analyzing {len(candidate_users)} potential candidates...\n")
        
        recommendations = matcher.get_profile_recommendations(
            user_id=user_usn,
            candidate_ids=candidate_users,
            preferred_days=None,  # Use all days
            min_match_threshold=0.0  # Include all matches, even 0%
        )
        
        if not recommendations:
            print("[ERROR] No recommendations found")
            return
        
        # Filter and display results
        print("\n" + "="*60)
        print("   MATCHING RESULTS")
        print("="*60)
        
        # Separate into categories
        excellent_matches = [r for r in recommendations if r['schedule_match']['match_percentage'] >= 30]
        good_matches = [r for r in recommendations if 10 <= r['schedule_match']['match_percentage'] < 30]
        fair_matches = [r for r in recommendations if 1 <= r['schedule_match']['match_percentage'] < 10]
        no_matches = [r for r in recommendations if r['schedule_match']['match_percentage'] == 0]
        
        # Display excellent matches
        if excellent_matches:
            print(f"\n[EXCELLENT MATCHES] (>=30% compatibility): {len(excellent_matches)} found")
            print("-" * 60)
            for i, rec in enumerate(excellent_matches[:team_size], 1):
                _display_match_result(rec, i)
        
        # Display good matches
        if good_matches:
            print(f"\n[GOOD MATCHES] (10-29% compatibility): {len(good_matches)} found")
            print("-" * 60)
            display_count = min(team_size - len(excellent_matches), len(good_matches))
            for i, rec in enumerate(good_matches[:display_count], len(excellent_matches) + 1):
                _display_match_result(rec, i)
        
        # Display fair matches
        if fair_matches:
            print(f"\n[FAIR MATCHES] (1-9% compatibility): {len(fair_matches)} found")
            print("-" * 60)
            displayed_so_far = len(excellent_matches) + min(len(good_matches), team_size - len(excellent_matches))
            display_count = min(team_size - displayed_so_far, len(fair_matches))
            for i, rec in enumerate(fair_matches[:display_count], displayed_so_far + 1):
                _display_match_result(rec, i)
        
        # Handle no matches scenario
        if no_matches and not (excellent_matches or good_matches or fair_matches):
            print(f"\n[NO MATCHES] 0% compatibility with all {len(no_matches)} candidates")
            print("-" * 60)
            print("\n[RECOMMENDATIONS]:")
            print("\n1. Add More Time Slots:")
            print("   Your current available slots: {}".format(user_profile['total_available_slots']))
            print("   Try adding more flexible time slots to your profile.")
            
            print("\n2. Analyze Common Patterns:")
            print("   Let's check when other users are typically available...\n")
            
            # Analyze when other users are available
            _analyze_common_availability(matcher, candidate_users[:20], user_usn)
            
            print("\n3. Consider Asynchronous Collaboration:")
            print("   For projects/study groups, you might not need 100% schedule overlap.")
            print("   Consider using collaboration tools for asynchronous work.")
            
            # Still show some candidates based on other criteria
            print("\n4. Alternative Candidates (based on profile similarity):")
            print("-" * 60)
            for i, rec in enumerate(no_matches[:team_size], 1):
                print(f"\n{i}. {rec['name']} ({rec['user_id']})")
                print(f"   Department: {rec['department']} | Year: {rec['year']}")
                print(f"   Available Slots: {rec['total_available_slots']}")
                print(f"   Schedule Match: 0% [NO MATCH]")
                if rec['skills']:
                    skills_str = ", ".join([s['skill_name'] for s in rec['skills'][:3]])
                    print(f"   Skills: {skills_str}")
        
        # Optimal team formation if we have enough good matches
        if len(excellent_matches) + len(good_matches) >= team_size:
            print("\n" + "="*60)
            print("   OPTIMAL TEAM FORMATION")
            print("="*60)
            
            # Get top candidates
            top_candidates = (excellent_matches + good_matches)[:min(team_size * 2, 20)]
            candidate_ids = [r['user_id'] for r in top_candidates]
            
            print(f"\n[*] Analyzing {len(candidate_ids)} top candidates for optimal team of {total_team_size}...")
            
            # Find optimal team including the user
            team_with_user = [user_usn] + candidate_ids
            
            # Calculate best team combination
            best_team = _find_best_team_combination(
                matcher, 
                user_usn, 
                candidate_ids, 
                team_size
            )
            
            if best_team:
                print(f"\n[RECOMMENDED TEAM]:")
                print("-" * 60)
                for i, member_id in enumerate(best_team, 1):
                    if member_id == user_usn:
                        print(f"{i}. {user_profile['name']} ({member_id}) [YOU]")
                    else:
                        member_rec = next((r for r in recommendations if r['user_id'] == member_id), None)
                        if member_rec:
                            match_pct = member_rec['schedule_match']['match_percentage']
                            print(f"{i}. {member_rec['name']} ({member_id}) - {match_pct}% match with you")
                
                # Find common meeting slots for the team
                print(f"\n[*] Finding common meeting slots for the team...")
                meeting_slots = matcher.find_team_meeting_slots(
                    team_member_ids=best_team,
                    preferred_days=['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    min_duration_hours=2
                )
                
                if 'error' not in meeting_slots:
                    stats = meeting_slots['statistics']
                    print(f"\n   Perfect Slots (100% team available): {stats['total_perfect_slots']}")
                    print(f"   Good Slots (≥80% team available): {stats['total_good_slots']}")
                    print(f"   Success Rate: {stats['success_rate']}%")
                    
                    if meeting_slots['perfect_slots']:
                        print(f"\n   [BEST MEETING TIMES]:")
                        for slot in meeting_slots['perfect_slots'][:5]:
                            print(f"      - {slot['day']} {slot['time_slot']}")
                    elif meeting_slots['good_slots']:
                        print(f"\n   [GOOD MEETING TIMES]:")
                        for slot in meeting_slots['good_slots'][:5]:
                            print(f"      - {slot['day']} {slot['time_slot']} ({slot['availability_percentage']}% available)")
        
        print("\n" + "="*60)
        print("   Search Complete!")
        print("="*60 + "\n")
        
    except KeyboardInterrupt:
        print("\n\n[CANCELLED] Search cancelled by user")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        if hasattr(matcher, 'db') and matcher.db:
            matcher.db.close()


def _display_match_result(rec: Dict, index: int):
    """Helper function to display a match result"""
    match_pct = rec['schedule_match']['match_percentage']
    common_slots = rec['schedule_match']['common_slots']
    
    print(f"\n{index}. {rec['name']} ({rec['user_id']})")
    print(f"   Department: {rec['department']} | Year: {rec['year']}")
    print(f"   Schedule Match: {match_pct}% | Common Slots: {common_slots}")
    print(f"   Available Slots: {rec['total_available_slots']}")
    
    if rec.get('best_days'):
        best_days_str = ", ".join([f"{d['day']} ({d['day_percentage']}%)" for d in rec['best_days'][:3]])
        print(f"   Best Days: {best_days_str}")
    
    if rec['skills']:
        skills_str = ", ".join([s['skill_name'] for s in rec['skills'][:3]])
        print(f"   Skills: {skills_str}")


def _analyze_common_availability(matcher, candidate_ids: List[str], user_usn: str):
    """Analyze when most candidates are available to provide recommendations"""
    try:
        users_data = matcher.load_user_profiles(candidate_ids[:20])
        
        # Count availability by day and time slot
        day_slot_counts = {}
        for day in matcher.days:
            day_slot_counts[day] = {}
            for slot in matcher.time_slots:
                day_slot_counts[day][slot] = 0
        
        # Count how many users are available for each slot
        for user_id, user_data in users_data.items():
            for day in matcher.days:
                for slot in user_data['schedule'][day]['available']:
                    if slot in day_slot_counts[day]:
                        day_slot_counts[day][slot] += 1
        
        # Find most popular slots
        popular_slots = []
        for day in matcher.days:
            for slot, count in day_slot_counts[day].items():
                if count > 0:
                    popular_slots.append({
                        'day': day,
                        'slot': slot,
                        'count': count,
                        'percentage': (count / len(users_data)) * 100
                    })
        
        # Sort by popularity
        popular_slots.sort(key=lambda x: x['count'], reverse=True)
        
        if popular_slots:
            print("   Most popular time slots among other users:")
            for i, slot_info in enumerate(popular_slots[:5], 1):
                print(f"   {i}. {slot_info['day'].capitalize()} {slot_info['slot'][0]}-{slot_info['slot'][1]} ")
                print(f"      ({slot_info['count']} users, {slot_info['percentage']:.1f}% of analyzed users)")
            
            print("\n   [TIP] Consider adding these time slots to your profile for better matches!")
        else:
            print("   No common availability patterns found.")
    
    except Exception as e:
        print(f"   Could not analyze availability patterns: {e}")


def _find_best_team_combination(matcher, user_usn: str, candidate_ids: List[str], team_size: int) -> Optional[List[str]]:
    """Find the best team combination including the user"""
    try:
        from itertools import combinations
        
        # Limit candidates to avoid performance issues
        candidates = candidate_ids[:min(15, len(candidate_ids))]
        
        if len(candidates) < team_size:
            return [user_usn] + candidates
        
        best_team = None
        best_score = -1
        
        # Try different combinations
        for combo in combinations(candidates, team_size):
            team = [user_usn] + list(combo)
            
            # Calculate average pairwise match
            total_match = 0
            pair_count = 0
            
            for i in range(len(team)):
                for j in range(i + 1, len(team)):
                    match_result = matcher.calculate_schedule_match_percentage(team[i], team[j])
                    if 'error' not in match_result:
                        total_match += match_result['match_percentage']
                        pair_count += 1
            
            if pair_count > 0:
                avg_match = total_match / pair_count
                if avg_match > best_score:
                    best_score = avg_match
                    best_team = team
        
        return best_team
    
    except Exception as e:
        print(f"   Error finding optimal team: {e}")
        return [user_usn] + candidate_ids[:team_size]


if __name__ == "__main__":
    import argparse
    # Simple CLI interface
    parser = argparse.ArgumentParser(description="SCHOLARX schedule tools")
    parser.add_argument('--match', nargs=2, metavar=('USER1_USN','USER2_USN'), help='Match two users by USN')
    parser.add_argument('--team', nargs='+', metavar=('USN'), help='Find team meeting slots for USNs')
    parser.add_argument('--optimal-teams', type=int, metavar='SIZE', help='Find optimal teams of specified size')
    parser.add_argument('--test', action='store_true', help='Run comprehensive test suite')
    parser.add_argument('--days', nargs='*', default=None, help='Preferred days (e.g., monday tuesday ...)')
    parser.add_argument('--min-threshold', type=float, default=10.0, help='Minimum match threshold for recommendations')
    parser.add_argument('--min-team-score', type=float, default=20.0, help='Minimum team compatibility score')
    parser.add_argument('--limit', type=int, default=10, help='Limit for recommendations or output lists')
    args = parser.parse_args()

    # If --test flag is provided, run the comprehensive test
    if args.test:
        test_enhanced_matcher()
    # If no CLI flags, run the interactive teammate finder
    elif not args.match and not args.team and not args.optimal_teams:
        interactive_teammate_finder()
    else:
        # Build config and matcher
        try:
            supabase_config = DatabaseConfig.create_config_from_secrets('supabase')
        except ValueError as e:
            print(f"Error: {e}")
            print("Please create secrets.py from secrets.example.py and fill in your values")
            raise SystemExit(1)

        matcher = EnhancedWebScheduleMatcher(supabase_config)
        if not matcher.connect_to_database():
            print("Failed to connect to database")
            raise SystemExit(1)

        try:
            if args.match:
                user1, user2 = args.match[0], args.match[1]
                preferred_days = args.days if args.days else matcher.days
                result = matcher.calculate_schedule_match_percentage(user1, user2, preferred_days)
                print(f"Schedule match between {user1} and {user2}:")
                if isinstance(result, dict) and 'error' in result:
                    print(f"  Error: {result['error']}")
                else:
                    print(matcher.format_schedule_match(result))

            if args.team:
                preferred_days = args.days if args.days else matcher.days
                team_ids = args.team
                meeting_result = matcher.find_team_meeting_slots(
                    team_member_ids=team_ids,
                    preferred_days=preferred_days,
                    min_duration_hours=2
                )
                if 'error' in meeting_result:
                    print(f"Error: {meeting_result['error']}")
                else:
                    stats = meeting_result['statistics']
                    print(f"Team meeting slots for {team_ids}:")
                    print(f"  Perfect: {stats['total_perfect_slots']} | Good: {stats['total_good_slots']} | Backup: {stats['total_backup_slots']}")
                    print(f"  Success rate: {stats['success_rate']}% | Recommendation: {stats['recommendation']}")
                    if meeting_result['perfect_slots']:
                        print("  Some perfect meeting times:")
                        for slot in meeting_result['perfect_slots'][:min(args.limit, 10)]:
                            print(f"    - {slot['day']} {slot['time_slot']} ({slot['availability_percentage']}% available)")
                    elif meeting_result['good_slots']:
                        print("  Some good meeting times:")
                        for slot in meeting_result['good_slots'][:min(args.limit, 5)]:
                            print(f"    - {slot['day']} {slot['time_slot']} ({slot['availability_percentage']}% available)")
                    elif meeting_result['backup_slots']:
                        print("  Some backup meeting times:")
                        for slot in meeting_result['backup_slots'][:min(args.limit, 5)]:
                            print(f"    - {slot['day']} {slot['time_slot']} ({slot['availability_percentage']}% available)")
                    
                    # Show fallback recommendations if available
                    if 'fallback_recommendations' in meeting_result:
                        fallback = meeting_result['fallback_recommendations']
                        if fallback['alternative_strategies']:
                            print("  Alternative strategies:")
                            for strategy in fallback['alternative_strategies'][:3]:
                                print(f"    - {strategy['strategy']}: {strategy['description']}")

            if args.optimal_teams:
                preferred_days = args.days if args.days else matcher.days
                optimal_result = matcher.find_optimal_teams(
                    team_size=args.optimal_teams,
                    preferred_days=preferred_days,
                    min_team_score=args.min_team_score,
                    max_teams=args.limit
                )
                
                if 'error' in optimal_result:
                    print(f"Error: {optimal_result['error']}")
                else:
                    print(f"Optimal teams of size {args.optimal_teams}:")
                    print(f"  Evaluated {optimal_result['total_combinations_evaluated']} combinations")
                    print(f"  Found {optimal_result['teams_found']} qualifying teams")
                    print()
                    
                    for i, team_data in enumerate(optimal_result['top_teams'][:args.limit]):
                        team_info = team_data['team_info']
                        meeting_slots = team_data['meeting_slots']
                        score = team_info['score']
                        
                        print(f"  Team {i+1}: {', '.join(team_info['team_names'])}")
                        print(f"    Compatibility Score: {score['overall_score']}")
                        print(f"    Avg Pairwise Match: {score['avg_pairwise_score']}%")
                        
                        if 'statistics' in meeting_slots:
                            stats = meeting_slots['statistics']
                            print(f"    Meeting Slots: Perfect={stats['total_perfect_slots']}, Good={stats['total_good_slots']}, Backup={stats['total_backup_slots']}")
                            print(f"    Success Rate: {stats['success_rate']}%")
                            print(f"    Recommendation: {stats['recommendation']}")
                        print()
        finally:
            matcher.close_connection()