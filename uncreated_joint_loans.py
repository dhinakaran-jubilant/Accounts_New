"""
Proxy module to expose backend.uncreated_joint_loans at project root level
regardless of whether the process was launched from root or backend directory.
"""
import sys
import os

_backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    from backend.uncreated_joint_loans import *
except ImportError:
    from uncreated_joint_loans import *

