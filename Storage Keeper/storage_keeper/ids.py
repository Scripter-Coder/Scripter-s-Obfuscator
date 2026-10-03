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

# PARTS - the fourth kind, and the only one with many instances per script.
#
# A script too large for one object is uploaded as a sequence of parts and delivered as
# a forward-only chain (the loader fetches them one at a time). The bound is the same 256
# the frontend and the worker have always used, kept identical on purpose: the worker
# writes 'SHG <n>' into the loader header and refuses an index above 255, so a service
# that accepted part300 would store bytes the delivery path can never ask for.
MAX_PARTS = 256

# Deliberately narrow. A kind becomes part of a FILENAME, so anything loose here would be
# a path-traversal surface - and the whole point of this service is that no caller-supplied
# string ever reaches the filesystem. digits only, anchored, and range-checked after the match.
PART_KIND_PATTERN = re.compile(r"^part([0-9]{1,3})$")


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


def is_part_kind(kind: object) -> bool:
    """True for 'part0' .. 'part255'. Out-of-range indices are NOT part kinds."""
    if not isinstance(kind, str):
        return False
    m = PART_KIND_PATTERN.match(kind)
    return m is not None and int(m.group(1)) < MAX_PARTS


def part_kind(index: int) -> str:
    """'part7' -> the kind for part 7. Raises InvalidId outside 0..255."""
    if not isinstance(index, int) or isinstance(index, bool):
        raise InvalidId("part index must be an integer")
    if index < 0 or index >= MAX_PARTS:
        raise InvalidId("part index out of range")
    return f"part{index}"


def validate_kind(kind: object) -> str:
    if kind in KINDS:
        return kind  # type: ignore[return-value]
    if is_part_kind(kind):
        return kind  # type: ignore[return-value]
    raise InvalidId("unknown object kind")