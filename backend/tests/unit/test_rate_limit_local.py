"""The global rate limit, counted in process (see middleware/rate_limit.py)."""
import importlib.util
import sys
import types
from pathlib import Path

# Load the counter without the app. The stubs stand in only while the module
# executes and are removed after, so a later test importing the real
# starlette or settings is not handed these.
_STUBS = {
    "starlette.middleware.base": {"BaseHTTPMiddleware": object},
    "starlette.requests": {"Request": object},
    "starlette.responses": {"JSONResponse": object},
    "app.core.client_ip": {"client_ip": lambda r: "x"},
    "app.core.config": {"settings": types.SimpleNamespace()},
}
_added = []
for name, attrs in _STUBS.items():
    if name not in sys.modules:
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        sys.modules[name] = mod
        _added.append(name)
try:
    _spec = importlib.util.spec_from_file_location(
        "rl", Path(__file__).resolve().parents[2] / "app/middleware/rate_limit.py")
    rl = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(rl)
finally:
    for name in _added:
        sys.modules.pop(name, None)


def test_counts_per_address_per_window():
    rl._local.clear()
    assert [rl._local_hit("1.1.1.1", 7) for _ in range(3)] == [1, 2, 3]
    assert rl._local_hit("2.2.2.2", 7) == 1, "another shopper has her own count"


def test_a_new_minute_starts_from_zero():
    rl._local.clear()
    for _ in range(150):
        rl._local_hit("1.1.1.1", 7)
    assert rl._local_hit("1.1.1.1", 8) == 1


def test_the_table_is_bounded_and_overflow_only_forgives():
    rl._local.clear()
    old = rl._LOCAL_MAX_KEYS
    rl._LOCAL_MAX_KEYS = 3
    try:
        for i in range(10):
            rl._local_hit(f"10.0.0.{i}", 1)
        assert len(rl._local) <= 3
    finally:
        rl._LOCAL_MAX_KEYS = old
        rl._local.clear()
