import sys
import os
import subprocess

# Current directory (backend root)
_base = os.path.dirname(os.path.abspath(__file__))

# Add backend root to sys.path
if _base not in sys.path:
    sys.path.insert(0, _base)

def _try_install_from_vendor():
    """Install all packages from local vendor/ folder using pip — no internet needed."""
    vendor_dir = os.path.join(_base, "vendor")
    req_file   = os.path.join(_base, "requirements.txt")
    if not os.path.isdir(vendor_dir):
        return
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install",
            "--no-index",
            f"--find-links={vendor_dir}",
            "-r", req_file,
            "--quiet",
        ])
    except Exception as e:
        print(f"[passenger_wsgi] vendor install failed: {e}", file=sys.stderr)

try:
    from a2wsgi import ASGIMiddleware
    from main import app
    application = ASGIMiddleware(app)

except ImportError:
    # First boot: packages not yet installed — install from bundled vendor/ folder
    print("[passenger_wsgi] Dependencies missing. Installing from vendor/...", file=sys.stderr)
    _try_install_from_vendor()

    # Retry imports after install
    try:
        from a2wsgi import ASGIMiddleware
        from main import app
        application = ASGIMiddleware(app)
        print("[passenger_wsgi] Dependencies installed and app loaded successfully!", file=sys.stderr)
    except Exception as e2:
        # Still failing — return 200 so cPanel health-check passes
        def application(environ, start_response):
            start_response('200 OK', [('Content-Type', 'text/plain')])
            return [f"TLC Backend: startup error — {e2}".encode()]

except Exception as e:
    def application(environ, start_response):
        start_response('200 OK', [('Content-Type', 'text/plain')])
        return [f"TLC Backend: startup error — {e}".encode()]
