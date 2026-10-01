"""Session helpers — signed-cookie auth (itsdangerous), Flask 3 compatible."""
from functools import wraps

from flask import current_app, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from ..extensions import db
from ..models import Account, Role, User, utcnow


def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="rysyl-session")


def apply_cookie(response, user: User):
    s = _serializer().dumps({"uid": user.id})
    response.set_cookie(
        "rysyl_session", s, max_age=60 * 60 * 24 * 14, httponly=True,
        samesite="Lax", path="/",
    )
    user.last_login_at = utcnow()
    db.session.commit()
    return response


def clear_cookie(response):
    response.set_cookie("rysyl_session", "", max_age=0, path="/")
    return response


class AuthError(Exception):
    def __init__(self, msg: str, code: int = 401):
        super().__init__(msg)
        self.code = code


def current_user() -> User | None:
    raw = request.cookies.get("rysyl_session", "")
    if not raw:
        return None
    try:
        data = _serializer().loads(raw, max_age=60 * 60 * 24 * 14)
    except BadSignature:
        return None
    return db.session.get(User, data.get("uid"))


def require_user(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            raise AuthError("Sign in required")
        if u.status.value == "Suspended":
            raise AuthError("Account suspended", 403)
        return fn(u, *a, **kw)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            raise AuthError("Sign in required")
        if u.role is not Role.ADMIN:
            raise AuthError("Administrator access required", 403)
        return fn(u, *a, **kw)
    return wrapper


def get_or_create_account(user: User) -> Account:
    acc = Account.query.filter_by(user_id=user.id).first()
    if not acc:
        acc = Account(user_id=user.id)
        db.session.add(acc)
        db.session.flush()
    return acc
