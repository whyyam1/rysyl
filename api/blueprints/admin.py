"""Admin endpoints: summary, deposit approve/reject, client management,
cycle lifecycle, audit feed, CSV reports."""
import csv
import io
from datetime import date, timedelta

from flask import Blueprint, Response, current_app, jsonify

from ..audit import record
from ..extensions import db
from ..models import (
    Account,
    AccountStatus,
    AuditLog,
    Cycle,
    CycleStatus,
    Role,
    Transaction,
    TxStatus,
    TxType,
    User,
    utcnow,
)
from ..money import kes
from ..notify import notify
from ..services.session import require_admin
from ..services.validate import ValidationError, json_body, need

bp = Blueprint("admin", __name__)


@bp.get("/api/admin/summary")
@require_admin
def summary(u):
    clients = User.query.filter(User.role == Role.CLIENT).order_by(User.id).all()
    accounts = {a.user_id: a for a in Account.query.all()}

    active = sum(1 for c in clients if c.status is AccountStatus.ACTIVE)
    review = sum(1 for c in clients
                 if c.status is AccountStatus.REVIEW or c.review_flagged)
    suspended = sum(1 for c in clients if c.status is AccountStatus.SUSPENDED)

    pending = (Transaction.query
               .filter(Transaction.status == TxStatus.PENDING)
               .order_by(Transaction.created_at.desc())
               .all())
    names = {c.id: c.name for c in clients}
    queue = [t.to_dict(client_name=names.get(t.user_id, "Unknown")) for t in pending]

    rows = []
    for c in clients:
        acc = accounts.get(c.id)
        bal = acc.balance() if acc else 0
        rows.append({
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "balance": bal,
            "balance_display": kes(bal),
            "cycles": c.completed_cycles,
            "status": c.status.value,
        })

    audit = [l.to_dict() for l in
             AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()]

    return jsonify(
        stats={
            "clients": len(clients),
            "active": active,
            "review": review,
            "suspended": suspended,
            "pending": len(pending),
        },
        pending=queue,
        clients=rows,
        audit=audit,
    )


@bp.post("/api/admin/deposits/<ref>/decide")
@require_admin
def decide(u, ref):
    d = json_body()
    decision = d.get("decision")
    if decision not in ("approve", "reject"):
        raise ValidationError("Decision must be approve or reject")

    tx = Transaction.query.filter_by(ref=ref).first()
    if not tx:
        raise ValidationError("No deposit with that reference")
    if tx.status is not TxStatus.PENDING:
        raise ValidationError("This deposit has already been decided")

    if decision == "approve":
        tx.status = TxStatus.APPROVED
        tx.decided_at = utcnow()
        tx.decided_by = u.id
        notify(tx.user_id, f"Deposit {tx.ref} approved.")
        record(u.id, "Deposit approved", tx.ref)
    else:
        reason = (d.get("reason") or "").strip()[:280] or "Payment could not be verified"
        tx.status = TxStatus.REJECTED
        tx.decided_at = utcnow()
        tx.decided_by = u.id
        tx.note = reason
        notify(tx.user_id, f"Deposit {tx.ref} rejected — {reason}")
        record(u.id, "Deposit rejected", tx.ref, reason)

    db.session.commit()
    return jsonify(ok=True, ref=tx.ref, status=tx.status.value)


@bp.get("/api/admin/clients/<int:cid>")
@require_admin
def client_detail(u, cid):
    client = db.session.get(User, cid)
    if not client or client.role is not Role.CLIENT:
        raise ValidationError("Client not found")
    acc = Account.query.filter_by(user_id=client.id).first()
    txs = []
    if acc:
        txs = [t.to_dict() for t in
               acc.transactions.order_by(Transaction.created_at.desc()).limit(50)]
    return jsonify(user=client.to_dict(full=True), balance=acc.balance() if acc else 0,
                   transactions=txs)


@bp.post("/api/admin/clients/<int:cid>/status")
@require_admin
def set_status(u, cid):
    d = json_body()
    client = db.session.get(User, cid)
    if not client or client.role is not Role.CLIENT:
        raise ValidationError("Client not found")
    try:
        status = AccountStatus(d.get("status") or "")
    except ValueError:
        raise ValidationError("Status must be Active, Review or Suspended")

    old = client.status
    client.status = status
    # Suspend, never delete (RECAP §1) — history and audit trail survive.
    notify(client.id, f"Your account status was changed to {status.value}.")
    record(u.id, f"Status set to {status.value}", client.name, f"was {old.value}")
    db.session.commit()
    return jsonify(ok=True, status=status.value)


# ---------- cycles (Sprint 4) ----------


def _next_cycle_ref() -> str:
    """Max numeric suffix across all cycle refs — id order is not ref order."""
    n = max((int(r[0].split("-")[1]) for r in db.session.query(Cycle.ref).all()
             if r[0].startswith("CY-")), default=0)
    return f"CY-{n + 1:04d}"


@bp.get("/api/admin/cycles")
@require_admin
def cycles_list(u):
    rows = Cycle.query.order_by(Cycle.created_at.desc()).limit(200).all()
    counts: dict[str, int] = {}
    for c in rows:
        counts[c.status.value] = counts.get(c.status.value, 0) + 1
    cfg = current_app.config
    return jsonify(
        cycles=[c.to_dict() for c in rows],
        counts=counts,
        settings={
            "duration_days": cfg["CYCLE_DEFAULT_DURATION_DAYS"],
            "rate_bps": cfg["CYCLE_DEFAULT_RATE_BPS"],
            "min_principal": cfg["CYCLE_MIN_PRINCIPAL_KES"],
            "review_threshold": cfg["CYCLE_REVIEW_THRESHOLD"],
        },
    )


@bp.post("/api/admin/cycles")
@require_admin
def cycle_create(u):
    """Admin-initiated cycle for a client (client requests flow through /me/cycles)."""
    d = json_body()
    cid = d.get("user_id")
    client = db.session.get(User, cid) if isinstance(cid, int) else None
    if not client or client.role is not Role.CLIENT:
        raise ValidationError("Pick a client for this cycle")
    try:
        principal = int(d.get("principal_minor"))
    except (TypeError, ValueError):
        raise ValidationError("principal_minor must be an integer (minor units)")
    if principal <= 0:
        raise ValidationError("Principal must be greater than zero")
    try:
        rate = int(d.get("rate_bps") or current_app.config["CYCLE_DEFAULT_RATE_BPS"])
        days = int(d.get("duration_days") or current_app.config["CYCLE_DEFAULT_DURATION_DAYS"])
    except (TypeError, ValueError):
        raise ValidationError("rate_bps and duration_days must be integers")
    if not (0 < rate <= 10_000):
        raise ValidationError("Rate must be between 1 and 10000 basis points")
    if not (1 <= days <= 3_650):
        raise ValidationError("Duration must be between 1 and 3650 days")

    cyc = Cycle(ref=_next_cycle_ref(), user_id=client.id,
                status=CycleStatus.PENDING, principal=principal, rate_bps=rate)
    db.session.add(cyc)
    notify(client.id, f"Cycle {cyc.ref} created for you — pending activation.")
    record(u.id, "Cycle created", cyc.ref, client.name)
    db.session.commit()
    return jsonify(ok=True, cycle=cyc.to_dict()), 201


@bp.post("/api/admin/cycles/<ref>/transition")
@require_admin
def cycle_transition(u, ref):
    """Move a cycle along the state machine. Side effects live HERE, once:
    - activation stamps start/maturity dates (duration is configurable)
    - completion increments completed_cycles and auto-flags Review at the threshold
    """
    d = json_body()
    target_raw = d.get("to") or ""
    try:
        target = CycleStatus(target_raw)
    except ValueError:
        raise ValidationError("Unknown cycle status")

    cyc = Cycle.query.filter_by(ref=ref).first()
    if not cyc:
        raise ValidationError("No cycle with that reference")
    if not cyc.can_transition(target):
        raise ValidationError(f"Cannot move a {cyc.status.value} cycle to {target.value}")

    old = cyc.status
    cyc.status = target

    if target is CycleStatus.ACTIVE:
        days = current_app.config["CYCLE_DEFAULT_DURATION_DAYS"]
        cyc.started_on = date.today()
        cyc.matures_on = cyc.started_on + timedelta(days=days)
        record(u.id, "Cycle activated", cyc.ref,
               f"matures {cyc.matures_on.isoformat()}")

    if target is CycleStatus.COMPLETED and old is CycleStatus.MATURED:
        cyc.user.completed_cycles = (cyc.user.completed_cycles or 0) + 1
        # Auto-flag "Review Required" at the configured completed-cycles threshold.
        threshold = current_app.config["CYCLE_REVIEW_THRESHOLD"]
        if cyc.user.completed_cycles >= threshold and not cyc.user.review_flagged:
            cyc.user.review_flagged = True
            notify(cyc.user_id, "Your account has been flagged for review after "
                                f"{cyc.user.completed_cycles} completed cycles.")
            record(u.id, "Auto-flagged Review Required", cyc.user.name,
                   f"{cyc.user.completed_cycles} completed cycles")

    notify(cyc.user_id, f"Cycle {cyc.ref} is now {target.value}.")
    record(u.id, f"Cycle {old.value} → {target.value}", cyc.ref)
    db.session.commit()
    return jsonify(ok=True, cycle=cyc.to_dict())


@bp.get("/api/admin/audit")
@require_admin
def audit_feed(u):
    rows = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()
    return jsonify(entries=[l.to_dict() for l in rows])


# ---------- reports (Sprint 5): CSV export, derived numbers only ----------


def _csv_response(actor_id, filename: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    record(actor_id, "Report exported (CSV)", filename)
    db.session.commit()
    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@bp.get("/api/admin/reports/deposits")
@require_admin
def report_deposits(u):
    q = (Transaction.query.filter(Transaction.type == TxType.DEPOSIT)
         .order_by(Transaction.created_at.desc()).limit(5_000).all())
    names = {c.id: c.name for c in User.query.all()}
    rows = [[t.ref, names.get(t.user_id, ""), t.status.value, str(t.amount),
             t.payer_name or "", t.payment_ref or "",
             t.created_at.isoformat()] for t in q]
    return _csv_response(u.id, "rysyl-deposits.csv",
                         ["ref", "client", "status", "amount_minor", "payer_name",
                          "payment_ref", "created_at"], rows)


@bp.get("/api/admin/reports/balances")
@require_admin
def report_balances(u):
    clients = User.query.filter(User.role == Role.CLIENT).order_by(User.name).all()
    accounts = {a.user_id: a for a in Account.query.all()}
    rows = []
    for c in clients:
        acc = accounts.get(c.id)
        bal = acc.balance() if acc else 0
        rows.append([c.name, c.email, c.status.value, str(bal), kes(bal),
                     c.completed_cycles])
    return _csv_response(u.id, "rysyl-balances.csv",
                         ["client", "email", "status", "balance_minor", "balance_kes",
                          "completed_cycles"], rows)


# ---------- platform-wide transactions (v2-parity admin page) ----------


@bp.get("/api/admin/transactions")
@require_admin
def transactions_list(u):
    """Every transaction across the platform — read-only ledger view for admins."""
    rows = (Transaction.query.order_by(Transaction.created_at.desc())
            .limit(300).all())
    names = {c.id: c.name for c in User.query.all()}
    return jsonify(transactions=[t.to_dict(client_name=names.get(t.user_id, "Unknown"))
                                 for t in rows])


# ---------- returns recording (v2-parity Returns page) ----------


@bp.post("/api/admin/returns")
@require_admin
def return_record(u):
    """Record an approved return against a COMPLETED cycle.
    The return is a ledger row like any other — there is no separate balance edit.
    Integer math only: amount_minor must be a positive integer."""
    d = json_body()
    cyc = Cycle.query.filter_by(ref=d.get("cycle_ref") or "").first()
    if not cyc:
        raise ValidationError("No cycle with that reference")
    if cyc.status is not CycleStatus.COMPLETED:
        raise ValidationError("Returns are recorded on completed cycles only")
    try:
        amount = int(d.get("amount_minor"))
    except (TypeError, ValueError):
        raise ValidationError("amount_minor must be an integer (minor units)")
    if amount <= 0:
        raise ValidationError("Return amount must be greater than zero")

    existing = Transaction.query.filter_by(note=f"Return for {cyc.ref} @ {(cyc.rate_bps / 100):.2f}%").first()
    if existing:
        raise ValidationError(f"A return for {cyc.ref} has already been recorded")

    acc = Account.query.filter_by(user_id=cyc.user_id).first()
    if not acc:
        raise ValidationError("This client has no ledger account")
    tx = Transaction(
        ref=_next_return_ref(), account_id=acc.id, user_id=cyc.user_id,
        type=TxType.RETURN, status=TxStatus.COMPLETED, amount=amount,
        note=f"Return for {cyc.ref} @ {(cyc.rate_bps / 100):.2f}%",
        decided_at=utcnow(), decided_by=u.id,
    )
    db.session.add(tx)
    notify(cyc.user_id, f"Return of {kes(amount)} recorded for {cyc.ref}.")
    record(u.id, "Return recorded", tx.ref, f"{cyc.ref} {kes(amount)}")
    db.session.commit()
    return jsonify(ok=True, transaction=tx.to_dict(client_name=cyc.user.name)), 201


def _next_return_ref() -> str:
    n = max((int(r[0].split("-")[1]) for r in db.session.query(Transaction.ref).all()
             if r[0].startswith("RET-")), default=20930)
    return f"RET-{n + 1}"


@bp.get("/api/admin/returns")
@require_admin
def returns_list(u):
    """Return rows joined to their cycles, for the admin Returns page."""
    rows = (Transaction.query.filter(Transaction.type == TxType.RETURN)
            .order_by(Transaction.created_at.desc()).limit(200).all())
    names = {c.id: c.name for c in User.query.all()}
    out = []
    for t in rows:
        d = t.to_dict(client_name=names.get(t.user_id, "Unknown"))
        cyc = Cycle.query.filter(Cycle.user_id == t.user_id).order_by(Cycle.created_at.desc()).first()
        d["cycle_ref"] = cyc.ref if cyc else "—"
        d["rate_pct"] = (cyc.rate_bps / 100) if cyc else None
        out.append(d)
    return jsonify(returns=out)


# ---------- admin broadcast (v2-parity Notifications page) ----------


@bp.post("/api/admin/notifications")
@require_admin
def broadcast(u):
    """Send a notification to every active/review client (or one targeted client)."""
    d = json_body()
    body = need(d, "body", 280)
    target_id = d.get("user_id")
    if target_id is not None:
        client = db.session.get(User, target_id) if isinstance(target_id, int) else None
        if not client:
            raise ValidationError("Client not found")
        notify(client.id, body)
        record(u.id, "Notification sent", client.name, body[:60])
        sent = 1
    else:
        sent = 0
        for c in User.query.filter(User.role == Role.CLIENT,
                                   User.status != AccountStatus.SUSPENDED).all():
            notify(c.id, body)
            sent += 1
        record(u.id, "Broadcast notification", f"{sent} clients", body[:60])
    db.session.commit()
    return jsonify(ok=True, sent=sent)
