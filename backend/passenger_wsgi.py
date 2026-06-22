import sys
import os

# Activate virtualenv if running in Passenger
_venv = '/home/djucnxxj/virtualenv/tlc_backend/3.11'
_activate = os.path.join(_venv, 'bin', 'activate_this.py')
if os.path.exists(_activate):
    with open(_activate) as f:
        code = compile(f.read(), _activate, 'exec')
        exec(code, dict(__file__=_activate))
else:
    _site_packages = os.path.join(_venv, 'lib', 'python3.11', 'site-packages')
    if os.path.exists(_site_packages) and _site_packages not in sys.path:
        sys.path.insert(0, _site_packages)

import asyncio
import http.client
import traceback

# Current directory (backend root)
_base = os.path.dirname(os.path.abspath(__file__))

# Add backend root to sys.path
if _base not in sys.path:
    sys.path.insert(0, _base)

class SyncASGIAdapter:
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    def __call__(self, environ, start_response):
        # 1. Translate WSGI environment to ASGI scope
        script_name = environ.get("SCRIPT_NAME", "")
        path_info = environ.get("PATH_INFO", "")
        
        # Prepend SCRIPT_NAME to match FastAPI routes (e.g. /api/stocks)
        path = script_name + path_info
        if not path.startswith("/"):
            path = "/" + path
            
        if path == "/api/diag":
            output = []
            output.append(f"Python Version: {sys.version}")
            
            import shutil
            import subprocess
            
            python_path = '/home/djucnxxj/virtualenv/tlc_backend/3.11/bin/python'
            site_packages = '/home/djucnxxj/virtualenv/tlc_backend/3.11/lib/python3.11/site-packages'
            
            # Step 1: Delete corrupted pip directories
            output.append("=== Deleting corrupted pip directories ===")
            pip_dir = os.path.join(site_packages, 'pip')
            if os.path.exists(pip_dir):
                output.append(f"Deleting {pip_dir}...")
                shutil.rmtree(pip_dir, ignore_errors=True)
            try:
                for d in os.listdir(site_packages):
                    if d.startswith('pip-') and d.endswith('.dist-info'):
                        d_path = os.path.join(site_packages, d)
                        output.append(f"Deleting {d_path}...")
                        shutil.rmtree(d_path, ignore_errors=True)
            except Exception as list_err:
                output.append(f"Failed to list site-packages: {list_err}")
            
            # Step 2: Repair pip via ensurepip
            output.append("=== Repairing pip via ensurepip ===")
            cmd_repair = [python_path, '-m', 'ensurepip', '--default-pip', '--upgrade']
            try:
                res = subprocess.run(cmd_repair, capture_output=True, text=True, timeout=120)
                output.append(f"Ensurepip STDOUT:\n{res.stdout}")
                output.append(f"Ensurepip STDERR:\n{res.stderr}")
                output.append(f"Ensurepip Exit code: {res.returncode}")
            except Exception as e:
                output.append(f"Failed to run ensurepip: {e}")
                
            # Step 3: Install pandas and yfinance
            output.append("=== Installing pandas and yfinance ===")
            cmd_install = [python_path, '-m', 'pip', 'install', '--force-reinstall', 'pandas', 'yfinance']
            try:
                res = subprocess.run(cmd_install, capture_output=True, text=True, timeout=180)
                output.append(f"Pip Install STDOUT:\n{res.stdout}")
                output.append(f"Pip Install STDERR:\n{res.stderr}")
                output.append(f"Pip Install Exit code: {res.returncode}")
            except Exception as e:
                output.append(f"Failed to run pip install: {e}")
                
            start_response("200 OK", [("content-type", "text/plain")])
            return ["\n".join(output).encode('utf-8')]
            
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": environ.get("SERVER_PROTOCOL", "HTTP/1.1").split("/")[-1],
            "method": environ.get("REQUEST_METHOD", "GET"),
            "headers": [],
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": environ.get("QUERY_STRING", "").encode("utf-8"),
            "server": (environ.get("SERVER_NAME", "localhost"), int(environ.get("SERVER_PORT", "80") or "80")),
            "client": (environ.get("REMOTE_ADDR", "127.0.0.1"), int(environ.get("REMOTE_PORT", "0") or "0")),
        }

        # Translate headers
        for k, v in environ.items():
            if k.startswith("HTTP_"):
                name = k[5:].replace("_", "-").lower().encode("utf-8")
                scope["headers"].append((name, v.encode("utf-8")))
            elif k in ("CONTENT_TYPE", "CONTENT_LENGTH"):
                name = k.replace("_", "-").lower().encode("utf-8")
                scope["headers"].append((name, v.encode("utf-8")))

        # 2. Setup receive and send channels
        body_io = environ.get("wsgi.input")
        content_length = int(environ.get("CONTENT_LENGTH") or "0")
        body_data = body_io.read(content_length) if content_length > 0 else b""

        received = False
        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body_data, "more_body": False}
            else:
                return {"type": "http.disconnect"}

        status_code = 200
        headers = []
        body_chunks = []

        async def send(message):
            nonlocal status_code, headers, body_chunks
            if message["type"] == "http.response.start":
                status_code = message["status"]
                for k, v in message.get("headers", []):
                    headers.append((k.decode("utf-8"), v.decode("utf-8")))
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))

        # 3. Run the ASGI app synchronously on a new event loop
        async def run_asgi():
            await self.asgi_app(scope, receive, send)

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(run_asgi())
            loop.close()
        except Exception as e:
            start_response("500 Internal Server Error", [("content-type", "text/plain")])
            return [f"TLC Backend: ASGI execution error — {e}".encode()]

        # 4. Return WSGI response
        status_phrase = http.client.responses.get(status_code, "OK")
        status_str = f"{status_code} {status_phrase}"
        start_response(status_str, headers)
        return body_chunks

try:
    from main import app
    application = SyncASGIAdapter(app)
except Exception as e:
    error_msg = str(e)
    def application(environ, start_response):
        start_response('500 Internal Server Error', [('Content-Type', 'text/plain')])
        return [f"TLC Backend: startup error — {error_msg}".encode()]
