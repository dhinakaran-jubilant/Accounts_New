"""
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Database connection pool, raw SQL execution, and schema utilities supporting PostgreSQL.
"""

import os
import logging
from urllib.parse import urlparse
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

logger = logging.getLogger(__name__)

def load_env_file():
    """Lightweight .env loader that parses key=value pairs into os.environ if not already present."""
    candidates = [
        os.path.join(os.getcwd(), '.env'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'),
    ]
    for env_path in candidates:
        if os.path.isfile(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#') or '=' not in line:
                            continue
                        k, v = line.split('=', 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v
                break
            except Exception:
                pass

load_env_file()

def parse_database_credentials():
    """Resolves database credentials from DATABASE_URL or individual environment variables."""
    raw_url = os.environ.get('DATABASE_URL')
    if raw_url:
        try:
            parsed = urlparse(raw_url)
            return {
                'dbname': parsed.path.lstrip('/') if parsed.path else 'accounts_new',
                'user': parsed.username or 'postgres',
                'password': parsed.password or '1234',
                'host': parsed.hostname or 'localhost',
                'port': str(parsed.port or 5432)
            }
        except Exception as e:
            logger.warning(f"Failed to parse DATABASE_URL: {e}")

    return {
        'dbname': os.environ.get('PG_DATABASE') or os.environ.get('PG_DBNAME') or os.environ.get('POSTGRES_DB', 'accounts_new'),
        'user': os.environ.get('PG_USER') or os.environ.get('POSTGRES_USER', 'postgres'),
        'password': os.environ.get('PG_PASSWORD') or os.environ.get('POSTGRES_PASSWORD', '1234'),
        'host': os.environ.get('PG_HOST') or os.environ.get('POSTGRES_HOST', 'localhost'),
        'port': str(os.environ.get('PG_PORT') or os.environ.get('POSTGRES_PORT', '5432'))
    }

# PostgreSQL Connection Credentials
PG_CREDENTIALS = parse_database_credentials()

def ensure_pg_database_exists(target_dbname=None):
    """
    Connects to the PostgreSQL server (via default maintenance db 'postgres')
    and checks if the target database exists. If it does not exist, creates it.
    Returns (success: bool, created_or_error: bool | str).
    """
    target = target_dbname or PG_CREDENTIALS['dbname']
    try:
        conn = psycopg2.connect(
            dbname='postgres',
            user=PG_CREDENTIALS['user'],
            password=PG_CREDENTIALS['password'],
            host=PG_CREDENTIALS['host'],
            port=PG_CREDENTIALS['port']
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (target,))
        exists = cur.fetchone() is not None
        created = False
        if not exists:
            cur.execute(f'CREATE DATABASE "{target}"')
            logger.info(f"Database '{target}' created successfully in PostgreSQL.")
            created = True
        else:
            logger.info(f"Database '{target}' already exists in PostgreSQL.")
        cur.close()
        conn.close()
        return True, created
    except Exception as e:
        logger.warning(f"PostgreSQL ensure_pg_database_exists warning: {e}")
        return False, str(e)

def get_database_url():
    """Returns normalized SQLAlchemy database URI from environment or credentials."""
    raw_url = os.environ.get('DATABASE_URL')
    if raw_url:
        if raw_url.startswith('postgres://'):
            raw_url = raw_url.replace('postgres://', 'postgresql://', 1)
        if raw_url.startswith('postgresql://') and '+psycopg2' not in raw_url:
            raw_url = raw_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
        return raw_url
    return (
        f"postgresql+psycopg2://{PG_CREDENTIALS['user']}:{PG_CREDENTIALS['password']}@"
        f"{PG_CREDENTIALS['host']}:{PG_CREDENTIALS['port']}/{PG_CREDENTIALS['dbname']}"
    )

def get_pg_connection(dbname=None, auto_create=True):
    """Returns an active psycopg2 PostgreSQL connection using resolved credentials."""
    target_db = dbname or PG_CREDENTIALS['dbname']
    if auto_create and target_db != 'postgres':
        ensure_pg_database_exists(target_db)
    return psycopg2.connect(
        dbname=target_db,
        user=PG_CREDENTIALS['user'],
        password=PG_CREDENTIALS['password'],
        host=PG_CREDENTIALS['host'],
        port=PG_CREDENTIALS['port']
    )
