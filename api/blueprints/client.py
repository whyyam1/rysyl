"""Client endpoints: summary, transactions, deposits, withdrawals, cycles, profile, notifications."""
from flask import Blueprint, current_app, jsonify

from ..audit import record
from ..extensions import db
from ..models import (
    Cycle,
    CycleStatus,
    Notification,
    SupportMessage,
    Transaction,
    TxStatus,
    TxType,
    User,
    utcnow,
)
from ..money import parse_major
from ..notify import notify
from ..services.session import get_or_create_account, require_user
from ..services.validate import ValidationError, json_body, need
from ..services.validate import email as v_email

bp = Blueprint("client", __name__)

# Ref sequences per transaction type — unique refs are a proposal requirement.
_NEXT_SEQ = {"DEP": 10517, "RET": 20931, "WDR": 30412, "CY": 3}


def next_ref(prefix: str) -> str:
    _NEXT_SEQ[prefix] += 1
    n = _NEXT_SEQ[prefix]
    # cycle refs are zero-padded to match the admin-created format (CY-0004)
    return f"{prefix}-{n:04d}" if prefix == "CY" else f"{prefix}-{n}"


@bp.get("/api/me/summary")
@require_user
def summary(u):
    acc = get_or_create_account(u)
    txs = acc.transactions.order_by(Transaction.created_at.desc()).all()
    bal = acc.balance()
    completed = u.completed_cycles
    approved_returns = sum(
        t.amount for t in txs
        if t.type is TxType.RETURN and t.status in (TxStatus.APPROVED, TxStatus.COMPLETED)
    )
    active = (u.cycles.filter_by(status=CycleStatus.ACTIVE).first()
              or u.cycles.filter_by(status=CycleStatus.MATURING).first())
    portfolio = [
        max(100, bal // 100 + i * 37 - (18 if i % 4 == 3 else 0))
        for i in range(13)
    ] if bal else [100 + i * 4 for i in range(13)]
    return jsonify(
        user=u.to_dict(),
        balance=bal,
        invested=max(0, bal - approved_returns),
        approved_returns=approved_returns,
        completed_cycles=completed,
        portfolio=portfolio,
        cycle=active.to_dict() if active else None,
        transactions=[t.to_dict() for t in txs[:10]],
        notifications=[n.to_dict() for n in
                       u.notifications.order_by(Notification.created_at.desc()).limit(5)],
    )


@bp.get("/api/me/notifications")
@require_user
def notifications(u):
    rows = (u.notifications.order_by(Notification.created_at.desc()).limit(50).all())
    unread = sum(1 for n in rows if not n.read)
    return jsonify(notifications=[n.to_dict() for n in rows], unread=unread)


@bp.post("/api/me/deposits")
@require_user
def submit_deposit(u):
    d = json_body()
    amount = parse_major(d.get("amount") or "")
    payer_name = need(d, "payer_name", 120)
    payment_ref = need(d, "payment_ref", 64)

    acc = get_or_create_account(u)
    tx = Transaction(
        ref=next_ref("DEP"), account_id=acc.id, user_id=u.id,
        type=TxType.DEPOSIT, status=TxStatus.PENDING,
        amount=amount, payer_name=payer_name, payment_ref=payment_ref,
        note=(d.get("note") or "").strip()[:280] or None,
    )
    db.session.add(tx)
    notify(u.id, f"Deposit {tx.ref} submitted — awaiting verification.")
    record(None, "Deposit submitted", tx.ref, f"KES {amount} minor units")
    db.session.commit()
    return jsonify(ok=True, transaction=tx.to_dict()), 201


@bp.get("/api/me/transactions")
@require_user
def transactions(u):
    acc = get_or_create_account(u)
    rows = (acc.transactions.order_by(Transaction.created_at.desc())
            .limit(200).all())
    return jsonify(transactions=[t.to_dict() for t in rows])


@bp.post("/api/me/withdrawals")
@require_user
def request_withdrawal(u):
    """Withdrawals ride the SAME transaction workflow (RECAP Sprint 3):
    submitted → Pending → admin approves/rejects. The balance is never touched here."""
    d = json_body()
    amount = parse_major(d.get("amount") or "")
    destination = need(d, "destination", 120)

    acc = get_or_create_account(u)
    # Cannot request more than the derived balance — rejects at submission time.
    if amount > acc.balance():
        raise ValidationError("Amount exceeds your available balance")

    tx = Transaction(
        ref=next_ref("WDR"), account_id=acc.id, user_id=u.id,
        type=TxType.WITHDRAWAL, status=TxStatus.PENDING,
        amount=amount, note=destination,
    )
    db.session.add(tx)
    notify(u.id, f"Withdrawal {tx.ref} requested — awaiting approval.")
    record(None, "Withdrawal requested", tx.ref)
    db.session.commit()
    return jsonify(ok=True, transaction=tx.to_dict()), 201


@bp.get("/api/me/cycles")
@require_user
def cycles(u):
    rows = (u.cycles.order_by(Cycle.created_at.desc()).all())
    return jsonify(cycles=[c.to_dict() for c in rows])


@bp.post("/api/me/cycles")
@require_user
def request_cycle(u):
    """Client requests a cycle; an admin activates it. Principal comes from the ledger.
    Duration/rate/minimum are configurable platform settings — never hardcoded."""
    d = json_body()
    amount = parse_major(d.get("amount") or "")

    acc = get_or_create_account(u)
    if amount > acc.balance():
        raise ValidationError("Amount exceeds your available balance")
    min_principal = current_app.config["CYCLE_MIN_PRINCIPAL_KES"] * 100
    if amount < min_principal:
        raise ValidationError(f"Minimum cycle principal is KES {min_principal // 100:,}")
    if u.cycles.filter(Cycle.status.in_([
            CycleStatus.PENDING, CycleStatus.APPROVED, CycleStatus.ACTIVE,
            CycleStatus.MATURING])).first():
        raise ValidationError("You already have a cycle awaiting completion")

    cyc = Cycle(
        ref=next_ref("CY"), user_id=u.id, status=CycleStatus.PENDING,
        principal=amount, rate_bps=current_app.config["CYCLE_DEFAULT_RATE_BPS"],
    )
    db.session.add(cyc)
    notify(u.id, f"Cycle request {cyc.ref} submitted — awaiting approval.")
    record(None, "Cycle requested", cyc.ref)
    db.session.commit()
    return jsonify(ok=True, cycle=cyc.to_dict()), 201


@bp.route("/api/me/profile", methods=["PUT", "PATCH"])
@require_user
def update_profile(u):
    d = json_body()
    if "name" in d:
        u.name = need(d, "name", 120)
    if "phone" in d:
        u.phone = (d.get("phone") or "").strip()[:32] or None
    if "email" in d:
        new_email = v_email(need(d, "email", 255))
        if new_email != u.email and User.query.filter_by(email=new_email).first():
            raise ValidationError("An account with this email already exists")
        u.email = new_email
    db.session.commit()
    return jsonify(ok=True, user=u.to_dict())


@bp.route("/api/me/preferences", methods=["PUT", "PATCH"])
@require_user
def update_preferences(u):
    """Email notification preferences (Security page)."""
    d = json_body()
    if "email_deposits" in d:
        u.email_deposits = bool(d["email_deposits"])
    if "email_cycles" in d:
        u.email_cycles = bool(d["email_cycles"])
    db.session.commit()
    return jsonify(ok=True, user=u.to_dict())


@bp.post("/api/me/notifications/<int:nid>/read")
@require_user
def mark_notification_read(u, nid):
    n = Notification.query.filter_by(id=nid, user_id=u.id).first()
    if not n:
        raise ValidationError("Notification not found")
    n.read = True
    db.session.commit()
    return jsonify(ok=True)


@bp.post("/api/me/notifications/read-all")
@require_user
def mark_all_notifications_read(u):
    rows = u.notifications.filter_by(read=False).all()
    for n in rows:
        n.read = True
    db.session.commit()
    return jsonify(ok=True, marked=len(rows))


@bp.get("/api/me/support")
@require_user
def support_list(u):
    rows = (SupportMessage.query.filter_by(user_id=u.id)
            .order_by(SupportMessage.created_at.desc()).limit(50).all())
    return jsonify(messages=[m.to_dict() for m in rows])


@bp.post("/api/me/support")
@require_user
def support_create(u):
    """Support request — recorded permanently, admin-visible, never deleted."""
    d = json_body()
    subject = need(d, "subject", 160)
    message = need(d, "message", 2000)
    m = SupportMessage(user_id=u.id, subject=subject, message=message)
    db.session.add(m)
    record(u.id, "Support message sent", subject[:60])
    db.session.commit()
    return jsonify(ok=True, message=m.to_dict()), 201
