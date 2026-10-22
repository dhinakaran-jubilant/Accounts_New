#!/usr/bin/env python3
"""
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Unified runner script to bootstrap virtual environment, verify database schemas, and orchestrate backend and frontend dev servers concurrently.
"""

import os
import sys
import subprocess
import threading
import signal
import time

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
FRONTEND_DIR = os.path.join(ROOT_DIR, 'frontend')

# Reconfigure stdout/stderr to UTF-8 on Windows if supported
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ANSI colors for nice terminal output
CYAN = '\033[96m' if sys.platform != 'win32' or os.environ.get('TERM') else ''
GREEN = '\033[92m' if sys.platform != 'win32' or os.environ.get('TERM') else ''
YELLOW = '\033[93m' if sys.platform != 'win32' or os.environ.get('TERM') else ''
RED = '\033[91m' if sys.platform != 'win32' or os.environ.get('TERM') else ''
BOLD = '\033[1m' if sys.platform != 'win32' or os.environ.get('TERM') else ''
RESET = '\033[0m' if sys.platform != 'win32' or os.environ.get('TERM') else ''

def log(tag, msg, color=CYAN):
    print(f"[{tag}] {msg}", flush=True)

def find_or_create_venv():
    """Locates or creates the backend Python virtual environment and returns its python executable."""
    candidates = [
        os.path.join(BACKEND_DIR, 'venv'),
        os.path.join(BACKEND_DIR, '.venv'),
        os.path.join(ROOT_DIR, 'venv'),
        os.path.join(ROOT_DIR, '.venv'),
    ]

    venv_dir = None
    for candidate in candidates:
        if os.path.isdir(candidate):
            venv_dir = candidate
            break

    # If no virtual environment exists, create one in backend/venv
    if not venv_dir:
        venv_dir = os.path.join(BACKEND_DIR, 'venv')
        log("ENV", f"Creating virtual environment in {venv_dir}...", YELLOW)
        res = subprocess.run([sys.executable, "-m", "venv", venv_dir])
        if res.returncode != 0:
            log("ENV", "Failed to create virtual environment! Falling back to current Python.", RED)
            return sys.executable

        # Install requirements
        req_file = os.path.join(BACKEND_DIR, 'requirements.txt')
        if os.path.exists(req_file):
            log("ENV", "Installing backend dependencies from requirements.txt...", YELLOW)
            pip_exe = os.path.join(venv_dir, 'Scripts', 'pip.exe') if sys.platform == 'win32' else os.path.join(venv_dir, 'bin', 'pip')
            subprocess.run([pip_exe, "install", "-r", req_file])

    # Determine Python executable inside venv
    if sys.platform == 'win32':
        venv_python = os.path.join(venv_dir, 'Scripts', 'python.exe')
    else:
        venv_python = os.path.join(venv_dir, 'bin', 'python')

    if not os.path.exists(venv_python):
        log("ENV", f"Python executable not found at {venv_python}, using system python.", YELLOW)
        return sys.executable

    log("ENV", f"Active virtual environment Python: {venv_python}", GREEN)
    return venv_python

def check_and_migrate_database(venv_python):
    """Verifies PostgreSQL connectivity and ensures target database and schemas exist."""
    log("DATABASE", "Checking PostgreSQL connection and database 'accounts_new'...", CYAN)

    pg_script = """
import sys
import os
sys.path.insert(0, r'''""" + BACKEND_DIR + """''')
import psycopg2
from db import PG_CREDENTIALS, get_pg_connection, ensure_pg_database_exists

# 1. Connect to PostgreSQL server and check if database exists; if not, create it
ok, result = ensure_pg_database_exists()
if ok:
    if result is True:
        print(f"PG_STATUS:Database '{PG_CREDENTIALS['dbname']}' did not exist; created successfully on PostgreSQL server.")
    else:
        print(f"PG_STATUS:Database '{PG_CREDENTIALS['dbname']}' verified on PostgreSQL server.")
else:
    print(f"PG_WARN:Could not verify/create database '{PG_CREDENTIALS['dbname']}': {result}")

# 2. Connect to the target database and list verified tables
try:
    conn = get_pg_connection()
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"PG_CONNECTED:{PG_CREDENTIALS['host']}:{PG_CREDENTIALS['port']}:{PG_CREDENTIALS['dbname']}:{len(tables)} tables: {', '.join(tables)}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"PG_ERROR:{e}")

# 3. Verify or create Super Admin user credentials (JC0033) if not exist
try:
    from app import app, db
    from models import User
    from werkzeug.security import generate_password_hash
    import json

    with app.app_context():
        db.create_all()
        admin_code = 'JC0033'
        admin_user = User.query.filter(db.func.lower(User.employee_code) == admin_code.lower()).first()
        if not admin_user:
            admin_user = User(
                employee_code=admin_code,
                password=generate_password_hash('Admin@123'),
                name='Dhinakaran Sekar',
                role='Super Admin',
                status='active',
                is_initial_password=False,
                email='dhinakaran.s@jubilantenterprises.in',
                mobile=None,
                permissions=json.dumps({"primary": [], "secondary": [], "isAdmin": True}),
                allowed_menus=json.dumps(['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings']),
                security_question=None,
                security_answer=None
            )
            db.session.add(admin_user)
            db.session.commit()
            print(f"PG_ADMIN:Created Super Admin credentials ({admin_code}) successfully.")
        else:
            print(f"PG_ADMIN:Super Admin credentials ({admin_code}) verified.")
except Exception as e_adm:
    print(f"PG_ADMIN_ERROR:{e_adm}")
"""

    res_pg = subprocess.run(
        [venv_python, "-c", pg_script],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True
    )
    if res_pg.returncode == 0:
        for line in res_pg.stdout.strip().splitlines():
            line = line.strip()
            if line.startswith("PG_STATUS:"):
                log("DATABASE", f"  [OK] {line[10:]}", GREEN)
            elif line.startswith("PG_WARN:"):
                log("DATABASE", f"  [WARNING] {line[8:]}", YELLOW)
            elif line.startswith("PG_CONNECTED:"):
                parts = line.split(":", 4)
                log("DATABASE", f"  [OK] PostgreSQL connected to {parts[1]}:{parts[2]} ('{parts[3]}') -> {parts[4]}", GREEN)
            elif line.startswith("PG_ADMIN:"):
                log("DATABASE", f"  [OK] {line[9:]}", GREEN)
            elif line.startswith("PG_ADMIN_ERROR:"):
                log("DATABASE", f"  [WARNING] Admin verification: {line[15:]}", YELLOW)
            elif line.startswith("PG_ERROR:"):
                log("DATABASE", f"  [WARNING] PostgreSQL check: {line[9:]}", YELLOW)

    log("DATABASE", "PostgreSQL database readiness check complete.", GREEN)

def stream_process_output(process, tag, color):
    """Streams stdout and stderr from a subprocess with colored tag prefix."""
    try:
        for line in iter(process.stdout.readline, ''):
            if not line:
                break
            line_str = line.rstrip('\r\n')
            if line_str:
                print(f"{color}[{tag}]{RESET} {line_str}", flush=True)
    except Exception:
        pass

import socket

def get_local_network_ip():
    """Detects primary local network IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

def ensure_ssl_certificates(venv_python):
    """Ensures cert.pem and key.pem exist in backend directory, generating them if missing."""
    cert_path = os.path.join(BACKEND_DIR, 'cert.pem')
    key_path = os.path.join(BACKEND_DIR, 'key.pem')
    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        gen_script = os.path.join(BACKEND_DIR, 'generate_ssl.py')
        if os.path.exists(gen_script):
            log("SSL", "Generating SSL certificate (cert.pem, key.pem)...", YELLOW)
            subprocess.run([venv_python, gen_script], cwd=BACKEND_DIR)
    
    has_ssl = os.path.exists(cert_path) and os.path.exists(key_path)
    if has_ssl:
        log("SSL", f"SSL certificate verified at {cert_path}", GREEN)
    return has_ssl

def main():
    network_ip = get_local_network_ip()
    backend_host = os.environ.get('HOST', '0.0.0.0')
    backend_port = os.environ.get('PORT', os.environ.get('BACKEND_PORT', '1110'))
    frontend_port = os.environ.get('VITE_PORT', os.environ.get('FRONTEND_PORT', '1111'))

    # 1. Activate or create virtual environment
    venv_python = find_or_create_venv()

    # 2. Check and ensure SSL certificates
    use_ssl = ensure_ssl_certificates(venv_python)
    proto = 'https' if use_ssl else 'http'

    print(f"""
{CYAN}{BOLD}=======================================================
   LoanDesk - Unified Backend & Frontend
   Host Machine:      {socket.gethostname()}
   Server Network IP: {network_ip}
   Security / SSL:    {'ENABLED (HTTPS)' if use_ssl else 'DISABLED (HTTP)'}
   Frontend Local:    {proto}://localhost:{frontend_port}
   Frontend Network:  {proto}://{network_ip}:{frontend_port}
   Backend Local:     {proto}://localhost:{backend_port}
   Backend Network:   {proto}://{network_ip}:{backend_port}
======================================================={RESET}
    """)

    # 3. Check and migrate required tables & columns
    check_and_migrate_database(venv_python)

    # 4. Launch Backend and Frontend
    processes = []

    def shutdown(signum=None, frame=None):
        log("RUNNER", "Shutting down backend and frontend services...", YELLOW)
        for p, name in processes:
            try:
                if sys.platform == 'win32':
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
                else:
                    p.terminate()
            except Exception:
                pass
        log("RUNNER", "Services stopped.", GREEN)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Launch Backend
    log("BACKEND", f"Starting Flask server on {proto}://{network_ip}:{backend_port} ...", CYAN)
    env_backend = os.environ.copy()
    env_backend['HOST'] = backend_host
    env_backend['PORT'] = str(backend_port)
    backend_proc = subprocess.Popen(
        [venv_python, "app.py"],
        cwd=BACKEND_DIR,
        env=env_backend,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append((backend_proc, "BACKEND"))

    # Launch Frontend
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    log("FRONTEND", f"Starting Vite frontend on {proto}://{network_ip}:{frontend_port} ...", GREEN)
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev", "--", "--host", "0.0.0.0", "--port", str(frontend_port)],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    processes.append((frontend_proc, "FRONTEND"))

    # Start reader threads
    t_backend = threading.Thread(
        target=stream_process_output,
        args=(backend_proc, "BACKEND", CYAN),
        daemon=True
    )
    t_frontend = threading.Thread(
        target=stream_process_output,
        args=(frontend_proc, "FRONTEND", GREEN),
        daemon=True
    )
    t_backend.start()
    t_frontend.start()

    log("RUNNER", "Both services are running! Press Ctrl+C to terminate.", BOLD)

    # Keep main thread alive and monitor processes
    try:
        while True:
            time.sleep(0.5)
            if backend_proc.poll() is not None:
                log("BACKEND", f"Backend exited with code {backend_proc.returncode}", RED)
                break
            if frontend_proc.poll() is not None:
                log("FRONTEND", f"Frontend exited with code {frontend_proc.returncode}", RED)
                break
    except KeyboardInterrupt:
        pass
    finally:
        shutdown()

if __name__ == '__main__':
    main()
