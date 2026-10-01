"""RYSYL data model.

NON-NEGOTIABLE RULES (see RECAP.md §1):
- Balances are ALWAYS derived from transaction history. There is no balance
  column anywhere in this schema. Editing a balance means editing transactions,
  which is auditable by construction.
- All monetary amounts are integers in MINOR UNITS (KES cents). 100_000_00 = KES 100,000.00.
  No floats for money, ever. Only money.py converts at the display edge.
- Accounts are suspended, never deleted. All rows keep created_at/updated_at.
"""
import enum
from datetime import date, datetime, timezone

from .extensions import db
from .settings import PlatformSettings as PS


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; treat stored times as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class TxType(enum.Enum):
    DEPOSIT = "Deposit"
    WITHDRAWAL = "Withdrawal"
    RETURN = "Return"


class TxStatus(enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class AccountStatus(enum.Enum):
    ACTIVE = "Active"
    REVIEW = "Review"
    SUSPENDED = "Suspended"


class CycleStatus(enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    ACTIVE = "Active"
    MATURING = "Maturing"
    MATURED = "Matured"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    SUSPENDED = "Suspended"


class Role(enum.Enum):
    CLIENT = "client"
    ADMIN = "admin"


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # email notification preferences (email-only MVP channel, proposal §8.6)
    email_deposits = db.Column(db.Boolean, nullable=False, default=True)
    email_cycles = db.Column(db.Boolean, nullable=False, default=True)
    role = db.Column(db.Enum(Role, native_enum=False), nullable=False, default=Role.CLIENT)
    status = db.Column(db.Enum(AccountStatus, native_enum=False), nullable=False,
                       default=AccountStatus.ACTIVE, index=True)
    review_flagged = db.Column(db.Boolean, nullable=False, default=False)
    completed_cycles = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    transactions = db.relationship("Transaction", back_populates="user", lazy="dynamic",
                                   foreign_keys="[Transaction.user_id]")
    cycles = db.relationship("Cycle", back_populates="user", lazy="dynamic")
    notifications = db.relationship("Notification", back_populates="user", lazy="dynamic")

    def set_password(self, raw: str) -> None:
        from werkzeug.security import generate_password_hash
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, raw or "")

    @property
    def is_admin(self) -> bool:
        return self.role is Role.ADMIN

    def to_dict(self, full: bool = False) -> dict:
        d = {
            "id": self.id, "name": self.name, "email": self.email,
            "role": self.role.value, "status": self.status.value,
            "completed_cycles": self.completed_cycles,
            "email_deposits": self.email_deposits,
            "email_cycles": self.email_cycles,
        }
        if full:
            d.update(phone=self.phone, review_flagged=self.review_flagged,
                     created_at=self.created_at.isoformat())
        return d


class Account(db.Model):
    """Ledger account. balance() is derived — there is no balance column."""
    __tablename__ = "accounts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship("User")
    transactions = db.relationship("Transaction", back_populates="account", lazy="dynamic")

    # ---- derived-balance invariant: the ONLY place balances come from ----
    def balance(self, statuses=(TxStatus.APPROVED, TxStatus.COMPLETED)) -> int:
        """Approved/completed deposits & returns minus withdrawals, minor units."""
        total = 0
        for t in self.transactions:
            if t.status not in statuses:
                continue
            if t.type in (TxType.DEPOSIT, TxType.RETURN):
                total += t.amount
            elif t.type is TxType.WITHDRAWAL:
                total -= t.amount
        return total

    def invested(self) -> int:
        """Sum of deposits+returns moved into cycles (net of withdrawals)."""
        return self.balance()

    def to_dict(self) -> dict:
        return {"id": self.id, "user_id": self.user_id, "balance": self.balance()}


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    ref = db.Column(db.String(16), unique=True, nullable=False, index=True)  # DEP-10517
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.Enum(TxType, native_enum=False), nullable=False)
    status = db.Column(db.Enum(TxStatus, native_enum=False), nullable=False,
                       default=TxStatus.PENDING, index=True)
    amount = db.Column(db.Integer, nullable=False)  # minor units, always > 0
    payer_name = db.Column(db.String(120), nullable=True)   # two-field match for verification
    payment_ref = db.Column(db.String(64), nullable=True)
    note = db.Column(db.String(280), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    decided_at = db.Column(db.DateTime(timezone=True), nullable=True)
    decided_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    account = db.relationship("Account", back_populates="transactions", foreign_keys=[account_id])
    user = db.relationship("User", back_populates="transactions", foreign_keys=[user_id])

    def to_dict(self, client_name: str | None = None) -> dict:
        d = {
            "ref": self.ref, "type": self.type.value, "amount": self.amount,
            "status": self.status.value, "date": self.created_at.strftime("%d %b"),
            "created_at": self.created_at.isoformat(),
        }
        if client_name is not None:
            d["client"] = client_name
            d["payment_ref"] = self.payment_ref or "—"
        return d


class Cycle(db.Model):
    __tablename__ = "cycles"
    id = db.Column(db.Integer, primary_key=True)
    ref = db.Column(db.String(16), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    status = db.Column(db.Enum(CycleStatus, native_enum=False), nullable=False,
                       default=CycleStatus.PENDING, index=True)
    principal = db.Column(db.Integer, nullable=False)  # minor units
    rate_bps = db.Column(db.Integer, nullable=False)   # return rate in basis points (700 = 7.00%)
    started_on = db.Column(db.Date, nullable=True)
    matures_on = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship("User", back_populates="cycles")

    # CONFIGURABLE duration & eligibility — read from PlatformSettings, never hardcoded (proposal §8.2)
    DEFAULT_DURATION_DAYS = PS.CYCLE_DEFAULT_DURATION_DAYS
    DEFAULT_RATE_BPS = PS.CYCLE_DEFAULT_RATE_BPS
    REVIEW_THRESHOLD_COMPLETED_CYCLES = PS.CYCLE_REVIEW_THRESHOLD

    def expected_return_minor(self) -> int:
        """principal * rate_bps / 10000 — integer math, rounded down (never floats)."""
        return self.principal * self.rate_bps // 10_000

    def can_transition(self, to: "CycleStatus") -> bool:
        """The proposal's cycle state machine (§ scope). Enforced server-side."""
        return to in _CYCLE_TRANSITIONS.get(self.status, set())

    def progress_pct(self, today: date | None = None) -> int:
        if self.status not in (CycleStatus.ACTIVE, CycleStatus.MATURING) or not self.started_on or not self.matures_on:
            return 0
        today = today or date.today()
        span = (self.matures_on - self.started_on).days or 1
        done = (today - self.started_on).days
        return max(0, min(100, round(done * 100 / span)))

    def days_remaining(self, today: date | None = None) -> int:
        if not self.matures_on or self.status not in (CycleStatus.ACTIVE, CycleStatus.MATURING):
            return 0
        today = today or date.today()
        return max(0, (self.matures_on - today).days)

    def to_dict(self) -> dict:
        return {
            "ref": self.ref,
            "client": self.user.name,
            "user_id": self.user_id,
            "status": self.status.value,
            "principal": self.principal,
            "rate_bps": self.rate_bps,
            "expected_return": self.expected_return_minor(),
            "progress": self.progress_pct(),
            "days_remaining": self.days_remaining(),
            "started": self.started_on.strftime("%d %b") if self.started_on else "—",
            "matures": self.matures_on.strftime("%d %b") if self.matures_on else "—",
            "started_iso": self.started_on.isoformat() if self.started_on else None,
            "matures_iso": self.matures_on.isoformat() if self.matures_on else None,
        }


# The proposal's cycle state machine (Pending → Approved → Active → Maturing →
# Matured → Completed, with Cancelled/Suspended as terminal exits).
_CYCLE_TRANSITIONS: dict[CycleStatus, set[CycleStatus]] = {
    CycleStatus.PENDING: {CycleStatus.APPROVED, CycleStatus.CANCELLED, CycleStatus.SUSPENDED},
    CycleStatus.APPROVED: {CycleStatus.ACTIVE, CycleStatus.CANCELLED, CycleStatus.SUSPENDED},
    CycleStatus.ACTIVE: {CycleStatus.MATURING, CycleStatus.CANCELLED, CycleStatus.SUSPENDED},
    CycleStatus.MATURING: {CycleStatus.MATURED, CycleStatus.CANCELLED, CycleStatus.SUSPENDED},
    CycleStatus.MATURED: {CycleStatus.COMPLETED},
    CycleStatus.COMPLETED: set(),
    CycleStatus.CANCELLED: set(),
    CycleStatus.SUSPENDED: set(),
}


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    body = db.Column(db.String(280), nullable=False)
    read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User", back_populates="notifications")

    def to_dict(self) -> dict:
        age = (utcnow() - aware(self.created_at)).total_seconds()
        when = f"{int(age // 3600)}h" if age >= 3600 else f"{max(1, int(age // 60))}m"
        if age >= 86400:
            when = f"{int(age // 86400)}d"
        return {"id": self.id, "body": self.body, "when": when, "read": self.read}


class AuditLog(db.Model):
    """Append-only. Who did what, to what, when. No update, no delete."""
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)  # None = system
    action = db.Column(db.String(120), nullable=False)
    target = db.Column(db.String(120), nullable=True)
    detail = db.Column(db.String(280), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    actor = db.relationship("User", foreign_keys=[actor_id])

    @property
    def line(self) -> str:
        return self.action + (f": {self.target}" if self.target else "")

    def to_dict(self) -> dict:
        t = aware(self.created_at)
        now = utcnow()
        when = t.strftime("%H:%M") if (now - t).days == 0 else ("Yesterday" if (now - t).days == 1 else t.strftime("%d %b"))
        return {"line": self.line, "when": when, "actor": self.actor.name if self.actor else "System"}


class SupportMessage(db.Model):
    """Client support requests. Created via the client Support page; never deleted."""
    __tablename__ = "support_messages"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    subject = db.Column(db.String(160), nullable=False)
    message = db.Column(db.String(2000), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User")

    def to_dict(self) -> dict:
        return {"id": self.id, "subject": self.subject, "message": self.message,
                "when": aware(self.created_at).strftime("%d %b %H:%M")}


class PasswordReset(db.Model):
    """Single-use, time-boxed password reset tokens. Only the SHA-256 hash is stored,
    so a DB leak cannot be replayed as a login link."""
    __tablename__ = "password_resets"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    user = db.relationship("User")

    def is_valid(self) -> bool:
        return self.used_at is None and aware(self.expires_at) > utcnow()
