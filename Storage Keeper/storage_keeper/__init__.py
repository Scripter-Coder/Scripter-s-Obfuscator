"""Storage Keeper: local object storage for ScripterHub generated scripts and loaders.

Public surface is deliberately small:

    Config, Store, Record     - the storage layer
    serve()                   - the HTTP service
    GONE_MESSAGE              - the one sentence a dead script produces
"""

from .config import Config, GONE_BODY, GONE_MESSAGE, HARD_CAP_SECONDS
from .ids import ID_PATTERN, InvalidId, is_valid_id, new_id, validate_id
from .store import Record, Store

__all__ = [
    "Config",
    "GONE_BODY",
    "GONE_MESSAGE",
    "HARD_CAP_SECONDS",
    "ID_PATTERN",
    "InvalidId",
    "Record",
    "Store",
    "is_valid_id",
    "new_id",
    "serve",
    "validate_id",
]


def serve(config=None, **kwargs):
    """Start the HTTP service. Imported lazily so the store stays usable on its own."""
    from .app import serve as _serve

    return _serve(config, **kwargs)