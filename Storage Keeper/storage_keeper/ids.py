"""Script identity.

The ONLY thing a client ever names is a script id. There is no "path" parameter anywhere
in this service, by design - a filesystem path supplied by a caller is the single
easiest way to turn a storage service into a file-read primitive, so the concept does not
exist in the API surface.

The id grammar is deliberately identical to the one the worker already enforces
(`^ScripterHub[0-9]{6,16}$`), so ids minted here are interchangeable with ids minted by
the existing pipeline and nothing downstream has to be taught a second format.
"""

from __future__ import annotations

import re
import secrets

# Matches the worker's own id pattern exactly. If this regex widens, the worker's does
# too, or the two will disagree about which ids are real.
ID_PATTERN = re.compile(r"^ScripterHub[0-9]{6,16}$")

PREFIX = "ScripterHub"
ID_DIGITS = 10  # 10^10 ids, collision-checked on write anyway.

# Kinds of stored object. A published script has up to three: the obfuscated bytes an
# executor runs, the loader source it runs first, and the encrypted copy the website's
# key page renders in a browser. Three kinds rather than one because they have genuinely
# different lifetimes and different readers, and collapsing them is how a browser preview
# ends up overwriting the script an executor is trying to run.
KIND_ARTIFACT = "artifact"
KIND_LOADER = "loader"
KIND_WEB = "web"
KINDS = (KIND_ARTIFACT, KIND_LOADER, KIND_WEB)


class InvalidId(ValueError):
    """Raised for anything that is not a well-formed script id.

    Deliberately carries no detail beyond a fixed string. The message is logged
    server-side; the HTTP layer never forwards it.
    """


def is_valid_id(candidate: object) -> bool:
    return isinstance(candidate, str) and ID_PATTERN.match(candidate) is not None


def validate_id(candidate: object) -> str:
    """Return the id, or raise InvalidId. Rejects anything that is not exactly an id."""
    if not isinstance(candidate, str):
        raise InvalidId("id must be a string")
    if not ID_PATTERN.match(candidate):
        raise InvalidId("id does not match the script id grammar")
    # Belt and braces. The regex already excludes "." and "/" so traversal is impossible,
    # but a path that is later joined onto a base directory deserves an explicit
    # containment check rather than an argument that the regex is sufficient.
    if candidate != candidate.strip() or "/" in candidate or "\\" in candidate:
        raise InvalidId("id contains path characters")
    if ".." in candidate or candidate.startswith("."):
        raise InvalidId("id contains traversal characters")
    return candidate


def new_id() -> str:
    """Mint a fresh id. Uniqueness is confirmed by the caller against the index."""
    n = secrets.randbelow(10 ** ID_DIGITS)
    return f"{PREFIX}{n:0{ID_DIGITS}d}"


def validate_kind(kind: object) -> str:
    if kind not in KINDS:
        raise InvalidId("unknown object kind")
    return kind  # type: ignore[return-value]