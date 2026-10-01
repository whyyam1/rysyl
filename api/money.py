"""Money formatting — the single display-edge converter.

Locked rule: storage is integer minor units (cents). Nothing outside this
module may multiply or divide money by 100.
"""
FORMAT_HINT = "KES"


def to_major(minor: int) -> str:
    """1234567 -> '12,345.67' — for the display edge only."""
    minor = int(minor)
    sign = "-" if minor < 0 else ""
    minor = abs(minor)
    major, cents = divmod(minor, 100)
    return f"{sign}{major:,}.{cents:02d}"


def kes(minor: int) -> str:
    """1234567 -> 'KES 12,345.67'."""
    return f"KES {to_major(minor)}"


def parse_major(text: str) -> int:
    """'100,000.50' / '100000' -> minor units. Raises ValueError on garbage/negatives."""
    t = str(text).strip().replace(",", "").replace("KES", "").replace("kes", "").strip()
    if not t:
        raise ValueError("Enter an amount")
    parts = t.split(".")
    if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) > 2):
        raise ValueError("Enter a valid amount, e.g. 100,000")
    if not all(p.isdigit() for p in parts):
        raise ValueError("Enter a valid amount, e.g. 100,000")
    major = int(parts[0] or "0")
    cents = int(parts[1].ljust(2, "0")) if len(parts) == 2 else 0
    minor = major * 100 + cents
    if minor <= 0:
        raise ValueError("Amount must be greater than zero")
    return minor
