"""Auth endpoints: register → verify (OTP placeholder) → login/logout/me,
plus password change / forgot / reset (v2-parity, token-hashed, single-use)."""
import hashlib
import os
import secrets
import time
from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request

from ..audit import record
from ..extensions import db
from ..models import AccountStatus, PasswordReset, Role, User, utcnow
from ..notify import notify
from ..services.session import (
    apply_cookie,
    clear_cookie,
    current_user,
    get_or_create_account,
    require_user,
)
from ..services.validate import ValidationError
from ..services.validate import email as v_email
from ..services.validate import json_body, need
from ..services.validate import password as v_password

bp = Blueprint("auth", __name__)

# --- lightweight in-memory rate limiting (single-process MVP) ---
_attempts: dict[str, list[float]] = {}


def _rate_limit(key: str) -> None:
    limit = current_app.config["RATE_LIMIT_AUTH"]
    window = current_app.config["RATE_LIMIT_WINDOW_S"]
    now = time.time()
    hits = [t for t in _attempts.get(key, []) if now - t < window]
    if len(hits) >= limit:
        raise ValidationError("Too many attempts. Try again shortly.")
    hits.append(now)
    _attempts[key] = hits


@bp.post("/api/auth/register")
def register():
    d = json_body()
    ip = "global"
    _rate_limit("reg:" + ip)
    name = need(d, "name", 120)
    email = v_email(need(d, "email", 255))
    phone = (d.get("phone") or "").strip()[:32] or None
    pw = v_password(d.get("password") or "")

    if User.query.filter_by(email=email).first():
        raise ValidationError("An account with this email already exists")

    user = User(name=name, email=email, phone=phone, role=Role.CLIENT,
                status=AccountStatus.ACTIVE)
    user.set_password(pw)
    db.session.add(user)
    db.session.flush()          # get user.id
    get_or_create_account(user)  # every client gets a ledger account
    # MVP verification decision (RECAP §3.2): email OTP placeholder row, ID docs later.
    notify(user.id, f"Welcome to RYSYL, {name.split()[0]}. Account created.")
    record(None, "Account created", email)
    db.session.commit()

    resp = jsonify({"ok": True, "user": user.to_dict(),
                    "verify": {"method": "email_otp", "sent": False}})
    return apply_cookie(resp, user)


@bp.post("/api/auth/login")
def login():
    d = json_body()
    _rate_limit("login")
    email = v_email(need(d, "email", 255))
    pw = d.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(pw):
        raise ValidationError("Invalid email or password")
    if user.status is AccountStatus.SUSPENDED:
        raise ValidationError("Account suspended — contact the administrator")
    resp = jsonify({"ok": True, "user": user.to_dict()})
    return apply_cookie(resp, user)


@bp.post("/api/auth/logout")
def logout():
    resp = jsonify({"ok": True})
    return clear_cookie(resp)


@bp.get("/api/auth/me")
def me():
    u = current_user()
    if not u:
        return jsonify(user=None)
    return jsonify(user=u.to_dict())


# ---------- password management (v2-parity) ----------


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _client_ip() -> str:
    return (request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.remote_addr or "?")


@bp.post("/api/auth/change-password")
@require_user
def change_password(u):
    """Signed-in password change on the client Security page. The audit entry
    keeps the IP as detail — append-only, like every other admin/client action."""
    d = json_body()
    if not u.check_password(d.get("current_password") or ""):
        raise ValidationError("Your current password is incorrect")
    u.set_password(v_password(d.get("new_password") or ""))
    record(u.id, "Password changed", u.email, f"ip {_client_ip()}")
    notify(u.id, "Your password was changed.")
    db.session.commit()
    return jsonify(ok=True)


@bp.post("/api/auth/forgot-password")
def forgot_password():
    """Always answers ok:true — never reveals whether an email exists.
    With SMTP configured the token goes out by email; in dev it is logged
    and (TESTING mode only) returned so tests can exercise the reset flow."""
    d = json_body()
    email_v = v_email(need(d, "email", 255))
    _rate_limit("forgot:" + _client_ip())
    user = User.query.filter_by(email=email_v).first()
    token = None
    if user:
        token = secrets.token_urlsafe(24)
        db.session.add(PasswordReset(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=utcnow() + timedelta(minutes=30),
        ))
        db.session.commit()
        from ..notify import send_email
        send_email(user.email, "Reset your RYSYL password",
                   f"Use this token within 30 minutes to reset your password: {token}")
        if not os.environ.get("SMTP_HOST"):
            current_app.logger.info("password reset token for %s: %s", user.email, token)
    if current_app.config.get("TESTING") and token:
        return jsonify(ok=True, token=token)
    return jsonify(ok=True)


@bp.post("/api/auth/reset-password")
def reset_password():
    """Single-use, time-boxed token → new password. Old reset tokens for the
    user are burned so a leaked link can't be replayed later."""
    d = json_body()
    token = need(d, "token", 200)
    pw = v_password(d.get("password") or "")
    row = PasswordReset.query.filter_by(token_hash=_hash_token(token)).first()
    if not row or not row.is_valid():
        raise ValidationError("This reset link is invalid or has expired")
    user = row.user
    user.set_password(pw)
    row.used_at = utcnow()
    # burn any other outstanding tokens for this user
    for other in PasswordReset.query.filter(
            PasswordReset.user_id == user.id,
            PasswordReset.used_at.is_(None)).all():
        other.used_at = utcnow()
    record(None, "Password reset via token", user.email, f"ip {_client_ip()}")
    notify(user.id, "Your password was reset.")
    db.session.commit()
    return jsonify(ok=True)
