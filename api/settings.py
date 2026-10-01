"""Configurable platform settings (proposal §8.2: configurable, never hardcoded).

Every business number an operator might tune lives here, overridable by env.
Views read these constants — no magic numbers in request handlers.
"""

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


class PlatformSettings:
    # --- investment cycles ---
    CYCLE_DEFAULT_DURATION_DAYS = _int("CYCLE_DEFAULT_DURATION_DAYS", 90)
    CYCLE_DEFAULT_RATE_BPS = _int("CYCLE_DEFAULT_RATE_BPS", 700)        # 700 = 7.00%
    CYCLE_MIN_PRINCIPAL_KES = _int("CYCLE_MIN_PRINCIPAL_KES", 50_000)   # whole KES

    # --- eligibility / review policy ---
    # After this many completed cycles an account is auto-flagged "Review".
    CYCLE_REVIEW_THRESHOLD = _int("CYCLE_REVIEW_THRESHOLD", 3)
