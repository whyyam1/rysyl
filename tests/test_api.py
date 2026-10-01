"""RYSYL API tests — the derived-balance invariant test is the crown jewel."""
import pytest

from api.extensions import db
from api.models import Account, AccountStatus, Transaction, TxStatus, TxType, Role, User
from api.money import kes, parse_major, to_major


# ---------- money ----------
def test_money_round_trip():
    assert to_major(128_450_000) == "1,284,500.00"
    assert kes(128_450_000) == "KES 1,284,500.00"
    assert parse_major("100,000") == 10_000_000
    assert parse_major("100000.5") == 10_000_050
    assert parse_major("KES 1,284,500.00") == 128_450_000
    with pytest.raises(ValueError):
        parse_major("abc")
    with pytest.raises(ValueError):
        parse_major("-5")
    with pytest.raises(ValueError):
        parse_major("0")


# ---------- derived-balance invariant ----------
def test_balance_is_derived_from_transactions(app):
    """No balance column exists; the number is recomputed from approved history."""
    with app.app_context():
        u = User(name="T", email="t@x.io", role=Role.CLIENT)
        u.set_password("password123")
        db.session.add(u)
        db.session.flush()
        acc = Account(user_id=u.id)
        db.session.add(acc)
        db.session.flush()

        def add(ref, ttype, status, amount):
            db.session.add(Transaction(ref=ref, account_id=acc.id, user_id=u.id,
                                       type=ttype, status=status, amount=amount))

        add("DEP-1", TxType.DEPOSIT, TxStatus.APPROVED, 100_000_00)
        add("DEP-2", TxType.DEPOSIT, TxStatus.PENDING, 500_000_00)   # not counted
        add("DEP-3", TxType.DEPOSIT, TxStatus.REJECTED, 900_000_00)  # not counted
        add("RET-1", TxType.RETURN, TxStatus.COMPLETED, 7_000_00)
        add("WDR-1", TxType.WITHDRAWAL, TxStatus.COMPLETED, 20_000_00)
        db.session.commit()

        assert acc.balance() == (100_000_00 + 7_000_00 - 20_000_00)

        # deciding the pending deposit changes the derived balance — the ledger is the truth
        pending = Transaction.query.filter_by(ref="DEP-2").first()
        pending.status = TxStatus.APPROVED
        assert acc.balance() == 100_000_00 + 500_000_00 + 7_000_00 - 20_000_00


# ---------- auth ----------
def test_register_login_me(client):
    r = client.post("/api/auth/register", json={
        "name": "Jane Doe", "email": "jane@x.io", "password": "password123"})
    assert r.status_code == 200 and r.get_json()["user"]["role"] == "client"

    r = client.get("/api/auth/me")
    assert r.get_json()["user"]["email"] == "jane@x.io"

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").get_json()["user"] is None

    r = client.post("/api/auth/login", json={"email": "jane@x.io", "password": "password123"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").get_json()["user"] is not None


def test_register_rejects_bad_input(client):
    assert client.post("/api/auth/register", json={
        "name": "X", "email": "bad-email", "password": "password123"}).status_code == 400
    assert client.post("/api/auth/register", json={
        "name": "X", "email": "ok@x.io", "password": "short"}).status_code == 400
    r = client.post("/api/auth/register", json={
        "name": "X", "email": "ok@x.io", "password": "password123"})
    r = client.post("/api/auth/register", json={
        "name": "Y", "email": "ok@x.io", "password": "password123"})
    assert r.status_code == 400  # duplicate email


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})
    assert client.post("/api/auth/login", json={
        "email": "jane@x.io", "password": "wrong-password"}).status_code == 400


# ---------- client endpoints ----------
def test_summary_requires_auth(client):
    assert client.get("/api/me/summary").status_code == 401


def test_deposit_submission_and_workflow(client):
    client.post("/api/auth/register", json={
        "name": "Jane Doe", "email": "jane@x.io", "password": "password123"})

    r = client.post("/api/me/deposits", json={
        "amount": "150,000", "payer_name": "Jane Doe", "payment_ref": "QK99XX"})
    assert r.status_code == 201
    ref = r.get_json()["transaction"]["ref"]
    assert ref.startswith("DEP-")

    r = client.post("/api/me/deposits", json={"amount": "junk", "payer_name": "j", "payment_ref": "q"})
    assert r.status_code == 400

    # a logged-in client cannot decide deposits — admin-only
    r = client.post(f"/api/admin/deposits/{ref}/decide", json={"decision": "approve"})
    assert r.status_code == 403


def test_admin_approve_reject_flow(client, app):
    from api.services.session import get_or_create_account

    client.post("/api/auth/register", json={
        "name": "Jane Doe", "email": "jane@x.io", "password": "password123"})
    r = client.post("/api/me/deposits", json={
        "amount": "150,000", "payer_name": "Jane Doe", "payment_ref": "QK99XX"})
    ref = r.get_json()["transaction"]["ref"]

    # client (non-admin) cannot call admin endpoints
    assert client.get("/api/admin/summary").status_code == 403

    # register a second user to act as admin
    client.post("/api/auth/register", json={
        "name": "Ops", "email": "ops@x.io", "password": "password123"})
    with app.app_context():
        admin = db.session.scalars(db.select(User).filter_by(email="ops@x.io")).one()
        admin.role = Role.ADMIN
        db.session.commit()

    r = client.post(f"/api/admin/deposits/{ref}/decide", json={"decision": "approve"})
    assert r.status_code == 200 and r.get_json()["status"] == "Approved"

    # balance derived from the approved deposit
    with app.app_context():
        jane = db.session.scalars(db.select(User).filter_by(email="jane@x.io")).one()
        acc = Account.query.filter_by(user_id=jane.id).first()
        assert acc.balance() == 15_000_000

    # double decision is rejected
    r = client.post(f"/api/admin/deposits/{ref}/decide", json={"decision": "reject"})
    assert r.status_code == 400


def test_admin_status_management(client, app):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})

    admin_client = app.test_client()
    admin_client.post("/api/auth/register", json={
        "name": "Ops", "email": "ops@x.io", "password": "password123"})
    with app.app_context():
        admin = db.session.scalars(db.select(User).filter_by(email="ops@x.io")).one()
        admin.role = Role.ADMIN
        db.session.commit()
        jane_id = db.session.scalars(db.select(User).filter_by(email="jane@x.io")).one().id

    assert admin_client.post("/api/auth/login", json={
        "email": "ops@x.io", "password": "password123"}).status_code == 200
    r = admin_client.post(f"/api/admin/clients/{jane_id}/status", json={"status": "Suspended"})
    assert r.status_code == 200

    # Jane's existing session is rejected, and login is blocked too —
    # suspend, never delete: her ledger and audit history survive
    assert client.get("/api/me/summary").status_code == 403
    assert client.post("/api/auth/login", json={
        "email": "jane@x.io", "password": "password123"}).status_code == 400
    with app.app_context():
        jane = db.session.get(User, jane_id)
        assert jane.status is AccountStatus.SUSPENDED
        assert Account.query.filter_by(user_id=jane_id).first() is not None


def test_health(client):
    assert client.get("/api/health").get_json()["status"] == "ok"


# ---------- withdrawals (same workflow as deposits) ----------
def _client_with_balance(client, app, amount_major="100,000"):
    """Register Jane + an admin, approve Jane's deposit. Leaves Jane signed in."""
    client.post("/api/auth/register", json={
        "name": "Jane Doe", "email": "jane@x.io", "password": "password123"})
    r = client.post("/api/me/deposits", json={
        "amount": amount_major, "payer_name": "Jane Doe", "payment_ref": "QK99XX"})
    ref = r.get_json()["transaction"]["ref"]

    # separate cookie jar so the admin's session never clobbers Jane's
    admin_client = app.test_client()
    admin_client.post("/api/auth/register", json={
        "name": "Ops", "email": "ops@x.io", "password": "password123"})
    with app.app_context():
        admin = db.session.scalars(db.select(User).filter_by(email="ops@x.io")).one()
        admin.role = Role.ADMIN
        db.session.commit()
    r = admin_client.post(f"/api/admin/deposits/{ref}/decide", json={"decision": "approve"})
    assert r.status_code == 200


def test_withdrawal_workflow(client, app):
    _client_with_balance(client, app)

    # over-balance requests are rejected at submission (derived balance check)
    r = client.post("/api/me/withdrawals", json={
        "amount": "500,000", "destination": "KCB …8821"})
    assert r.status_code == 400

    # valid request lands Pending; the derived balance is untouched until approval
    r = client.post("/api/me/withdrawals", json={
        "amount": "10,000", "destination": "KCB …8821"})
    assert r.status_code == 201
    wref = r.get_json()["transaction"]["ref"]
    assert wref.startswith("WDR-")
    assert client.get("/api/me/summary").get_json()["balance"] == 10_000_000

    # admin approves → balance derives downward; ledger is the only truth
    admin = _promote_admin(app)
    r = admin.post(f"/api/admin/deposits/{wref}/decide", json={"decision": "approve"})
    assert r.status_code == 200
    assert client.get("/api/me/summary").get_json()["balance"] == 9_000_000


def test_withdrawal_requires_amount_and_destination(client):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})
    r = client.post("/api/me/withdrawals", json={"amount": "1,000", "destination": ""})
    assert r.status_code == 400


# ---------- cycles (Sprint 4) ----------
def _promote_admin(app):
    """Ensure ops@x.io is an admin and return a logged-in admin test client."""
    admin_client = app.test_client()
    admin_client.post("/api/auth/register", json={
        "name": "Ops", "email": "ops@x.io", "password": "password123"})
    with app.app_context():
        admin = db.session.scalars(db.select(User).filter_by(email="ops@x.io")).one()
        if admin.role is not Role.ADMIN:
            admin.role = Role.ADMIN
            db.session.commit()
    r = admin_client.post("/api/auth/login", json={
        "email": "ops@x.io", "password": "password123"})
    assert r.status_code == 200
    return admin_client


def _complete_cycle(admin, ref, steps=("Approved", "Active", "Maturing", "Matured", "Completed")):
    for step in steps:
        r = admin.post(f"/api/admin/cycles/{ref}/transition", json={"to": step})
        assert r.status_code == 200, (step, r.get_json())


def test_cycle_request_validation(client, app):
    _client_with_balance(client, app)

    # below the configurable minimum principal
    r = client.post("/api/me/cycles", json={"amount": "5,000"})
    assert r.status_code == 400

    # over balance
    r = client.post("/api/me/cycles", json={"amount": "500,000"})
    assert r.status_code == 400


CycleRef = str


def test_cycle_lifecycle_and_review_flag(client, app):
    """The state machine is enforced server-side, and the third completion
    auto-flags the account Review (configurable threshold)."""
    _client_with_balance(client, app)          # jane has KES 100,000 approved, signed in
    admin = _promote_admin(app)

    r = client.post("/api/me/cycles", json={"amount": "90,000"})
    assert r.status_code == 201
    ref = r.get_json()["cycle"]["ref"]

    # one open cycle at a time
    r = client.post("/api/me/cycles", json={"amount": "5,0000"})
    assert r.status_code == 400

    # invalid jump: Pending → Matured must be refused
    r = admin.post(f"/api/admin/cycles/{ref}/transition", json={"to": "Matured"})
    assert r.status_code == 400

    # activation stamps the maturity date from the configurable duration
    r = admin.post(f"/api/admin/cycles/{ref}/transition", json={"to": "Approved"})
    assert r.status_code == 200
    r = admin.post(f"/api/admin/cycles/{ref}/transition", json={"to": "Active"})
    cyc = r.get_json()["cycle"]
    assert cyc["started"] != "—" and cyc["matures"] != "—"
    assert cyc["days_remaining"] == app.config["CYCLE_DEFAULT_DURATION_DAYS"]

    _complete_cycle(admin, ref, steps=("Maturing", "Matured", "Completed"))

    with app.app_context():
        jane = db.session.scalars(db.select(User).filter_by(email="jane@x.io")).one()
        assert jane.completed_cycles == 1
        assert jane.review_flagged is False   # threshold is 3

    # two more admin-created cycles to cross the threshold
    with app.app_context():
        jane_id = jane.id
    for _ in range(2):
        r = admin.post("/api/admin/cycles", json={
            "user_id": jane_id, "principal_minor": 5_000_000})
        assert r.status_code == 201
        _complete_cycle(admin, r.get_json()["cycle"]["ref"])

    with app.app_context():
        jane = db.session.scalars(db.select(User).filter_by(email="jane@x.io")).one()
        assert jane.completed_cycles == 3
        assert jane.review_flagged is True    # auto-flagged Review Required


def test_admin_cycles_require_admin(client):
    assert client.get("/api/admin/cycles").status_code == 401
    assert client.get("/api/admin/audit").status_code == 401
    assert client.get("/api/admin/reports/balances").status_code == 401


# ---------- reports (CSV) ----------
def test_reports_csv(client, app):
    _client_with_balance(client, app)
    admin = _promote_admin(app)

    r = admin.get("/api/admin/reports/deposits")
    assert r.status_code == 200
    assert r.mimetype == "text/csv"
    lines = r.get_data(as_text=True).strip().splitlines()
    assert lines[0].startswith("ref,client,status,amount_minor")
    assert len(lines) >= 2

    r = admin.get("/api/admin/reports/balances")
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    assert "Jane Doe" in body and "balance_minor" in body


# ---------- v2-parity: password change / forgot / reset ----------
def test_change_password_flow(client):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})

    # wrong current password refused
    r = client.post("/api/auth/change-password", json={
        "current_password": "wrong-pass", "new_password": "newpassword9"})
    assert r.status_code == 400

    r = client.post("/api/auth/change-password", json={
        "current_password": "password123", "new_password": "newpassword9"})
    assert r.status_code == 200

    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={
        "email": "jane@x.io", "password": "password123"}).status_code == 400
    assert client.post("/api/auth/login", json={
        "email": "jane@x.io", "password": "newpassword9"}).status_code == 200


def test_forgot_and_reset_password_flow(client, app):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})

    # unknown email answers ok:true with NO token — no user enumeration
    r = client.post("/api/auth/forgot-password", json={"email": "ghost@x.io"})
    assert r.status_code == 200 and "token" not in r.get_json()

    # known email returns the token in TESTING mode (emailed when SMTP is set)
    r = client.post("/api/auth/forgot-password", json={"email": "jane@x.io"})
    token = r.get_json().get("token")
    assert token

    r = client.post("/api/auth/reset-password", json={"token": token, "password": "thirdpass44"})
    assert r.status_code == 200

    # single-use: the burned token cannot reset again
    r = client.post("/api/auth/reset-password", json={"token": token, "password": "fourthpass55"})
    assert r.status_code == 400

    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={
        "email": "jane@x.io", "password": "thirdpass44"}).status_code == 200


# ---------- v2-parity: notification read state ----------
def test_notification_read_state(client):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})

    d = client.get("/api/me/notifications").get_json()
    assert d["unread"] >= 1 and d["notifications"][0]["read"] is False
    nid = d["notifications"][0]["id"]

    assert client.post(f"/api/me/notifications/{nid}/read").status_code == 200
    assert client.post("/api/me/notifications/read-all").status_code == 200
    assert client.get("/api/me/notifications").get_json()["unread"] == 0


# ---------- v2-parity: support messages ----------
def test_support_messages(client):
    client.post("/api/auth/register", json={
        "name": "Jane", "email": "jane@x.io", "password": "password123"})

    r = client.post("/api/me/support", json={"subject": "Question", "message": "How do cycles work?"})
    assert r.status_code == 201

    rows = client.get("/api/me/support").get_json()["messages"]
    assert len(rows) == 1 and rows[0]["subject"] == "Question"

    r = client.post("/api/me/support", json={"subject": "", "message": "x"})
    assert r.status_code == 400


# ---------- v2-parity: admin transactions / returns / broadcast ----------
def test_admin_transactions_returns_broadcast(client, app):
    _client_with_balance(client, app)   # jane: KES 100,000 approved, signed in
    admin = _promote_admin(app)

    r = client.post("/api/me/cycles", json={"amount": "90,000"})
    ref = r.get_json()["cycle"]["ref"]
    _complete_cycle(admin, ref)

    # platform-wide transactions feed shows the ledger
    rows = admin.get("/api/admin/transactions").get_json()["transactions"]
    assert any(t["type"] == "Deposit" and t.get("client") for t in rows)

    # record the return on the completed cycle — balance re-derives upward
    r = admin.post("/api/admin/returns", json={"cycle_ref": ref, "amount_minor": 6_300_00})
    assert r.status_code == 201
    ret_ref = r.get_json()["transaction"]["ref"]
    assert ret_ref.startswith("RET-")

    # duplicate return for the same cycle is refused
    r = admin.post("/api/admin/returns", json={"cycle_ref": ref, "amount_minor": 6_300_00})
    assert r.status_code == 400

    bal = client.get("/api/me/summary").get_json()["balance"]
    assert bal == 10_000_000 + 6_300_00   # ledger is the only truth

    # returns listing includes the new row
    rets = admin.get("/api/admin/returns").get_json()["returns"]
    assert any(x["ref"] == ret_ref for x in rets)

    # broadcast reaches the client; targeted send works; both audit-logged
    r = admin.post("/api/admin/notifications", json={"body": "Maintenance window Saturday."})
    assert r.status_code == 200 and r.get_json()["sent"] >= 1
    with app.app_context():
        jane_id = db.session.scalars(db.select(User).filter_by(email="jane@x.io")).one().id
    r = admin.post("/api/admin/notifications", json={"body": "Solo ping", "user_id": jane_id})
    assert r.status_code == 200 and r.get_json()["sent"] == 1
    notes = client.get("/api/me/notifications").get_json()["notifications"]
    assert any("Maintenance" in n["body"] for n in notes)

    # clients cannot broadcast
    assert client.post("/api/admin/notifications", json={"body": "nope"}).status_code == 403
