"""Request validation helpers — small, explicit, server-side (never trust the client)."""
from flask import request


class ValidationError(Exception):
    def __init__(self, msg: str):
        super().__init__(msg)


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError("Send JSON")
    return data


def need(data: dict, key: str, max_len: int = 280) -> str:
    val = (data.get(key) or "").strip()
    if not val:
        raise ValidationError(f"{key.replace('_', ' ').capitalize()} is required")
    if len(val) > max_len:
        raise ValidationError(f"{key.replace('_', ' ').capitalize()} is too long")
    return val


def email(value: str) -> str:
    v = value.strip().lower()
    if "@" not in v or v.startswith("@") or v.endswith("@") or " " in v:
        raise ValidationError("Enter a valid email address")
    return v


def password(value: str) -> str:
    if len(value) < 8:
        raise ValidationError("Password must be at least 8 characters")
    if len(value) > 128:
        raise ValidationError("Password is too long")
    return value
