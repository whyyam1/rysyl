"""Seed the database with demo data matching the template exactly.

Run:  python -m api.seed   (from the project root)
Creates: admin@rysyl.group / Admin#2026  and  daniel@rysyl.group / Demo#2026
Re-running refreshes the demo data (idempotent by email).
"""
from datetime import date, datetime

from .app import create_app
from .extensions import db
from .models import (
    Account,
    AccountStatus,
    AuditLog,
    Cycle,
    CycleStatus,
    Notification,
    Role,
    Transaction,
    TxStatus,
    TxType,
    User,
)
from .notify import notify

app = create_app()

M = 100  # minor units per KES


def tx(ref, acc, user, ttype, status, amount_minor, created, payer=None, payref=None, note=None):
    created_at = created if isinstance(created, datetime) else datetime.strptime(created, "%Y-%m-%d %H:%M")
    return Transaction(ref=ref, account_id=acc.id, user_id=user.id, type=ttype,
                       status=status, amount=amount_minor, payer_name=payer,
                       payment_ref=payref, note=note, created_at=created_at)


def seed() -> None:
    with app.app_context():
        db.drop_all()
        db.create_all()

        admin = User(name="Ops Admin", email="admin@rysyl.group", role=Role.ADMIN,
                     status=AccountStatus.ACTIVE)
        admin.set_password("Admin#2026")
        db.session.add(admin)

        # --- clients (template names & statuses) ---
        daniel = User(name="Daniel Mwangi", email="daniel@rysyl.group", phone="+254700111222",
                      status=AccountStatus.ACTIVE, completed_cycles=2)
        daniel.set_password("Demo#2026")
        amina = User(name="Amina Kamau", email="amina@rysyl.group", status=AccountStatus.REVIEW,
                     completed_cycles=3)
        amina.set_password("Demo#2026")
        james = User(name="James Otieno", email="james@rysyl.group", status=AccountStatus.REVIEW,
                     completed_cycles=3)
        james.set_password("Demo#2026")
        sarah = User(name="Sarah Njeri", email="sarah@rysyl.group", status=AccountStatus.ACTIVE,
                     completed_cycles=1)
        sarah.set_password("Demo#2026")
        peter = User(name="Peter Ouma", email="peter@rysyl.group", status=AccountStatus.SUSPENDED,
                     completed_cycles=1)
        peter.set_password("Demo#2026")
        for c in (daniel, amina, james, sarah, peter):
            db.session.add(c)
            db.session.flush()
            db.session.add(Account(user_id=c.id))
        db.session.flush()

        accounts = {c.name: Account.query.filter_by(user_id=c.id).first()
                    for c in (daniel, amina, james, sarah, peter)}

        # --- Daniel's ledger: template numbers (KES -> minor units) ---
        da = accounts["Daniel Mwangi"]
        # derived balance target: 1,284,500.00 KES = 128_450_000 minor
        # 1,000,000 (invested deposit) + 250,000 (deposit) + 74,500 (returns) - 40,000 (withdrawal)
        db.session.add(tx("DEP-10410", da, daniel, TxType.DEPOSIT, TxStatus.COMPLETED,
                          1_000_000 * M, "2026-06-01 09:00", "Daniel Mwangi", "QK81AA00001"))
        db.session.add(tx("DEP-10482", da, daniel, TxType.DEPOSIT, TxStatus.APPROVED,
                          250_000 * M, "2026-09-12 10:12", "Daniel Mwangi", "QK82LM19XA"))
        db.session.add(tx("RET-20931", da, daniel, TxType.RETURN, TxStatus.COMPLETED,
                          74_500 * M, "2026-09-01 12:00", note="Cycle 02 return @7%"))
        db.session.add(tx("WDR-30412", da, daniel, TxType.WITHDRAWAL, TxStatus.COMPLETED,
                          40_000 * M, "2026-08-28 15:30", note="To KES …8821"))
        db.session.add(tx("DEP-10517", da, daniel, TxType.DEPOSIT, TxStatus.PENDING,
                          100_000 * M, "2026-09-21 14:05", "Daniel Mwangi", "QK83ZP41QQ"))

        # --- other clients (admin queue + review states) ---
        db.session.add(tx("DEP-10521", accounts["Amina Kamau"], amina, TxType.DEPOSIT,
                          TxStatus.PENDING, 150_000 * M, "2026-09-23 09:41",
                          "Amina Kamau", "QK82LM19XA"))
        db.session.add(tx("DEP-10522", accounts["James Otieno"], james, TxType.DEPOSIT,
                          TxStatus.PENDING, 500_000 * M, "2026-09-23 10:02",
                          "James Otieno", "QK83PN02TZ"))
        db.session.add(tx("DEP-10523", accounts["Sarah Njeri"], sarah, TxType.DEPOSIT,
                          TxStatus.PENDING, 75_000 * M, "2026-09-23 11:27",
                          "Sarah Njeri", "QK83RT77BC"))
        db.session.add(tx("RET-20930", accounts["Amina Kamau"], amina, TxType.RETURN,
                          TxStatus.COMPLETED, 93_000 * M, "2026-08-15 12:00",
                          note="Cycle 03 return @7.5%"))
        db.session.add(tx("DEP-10455", accounts["Amina Kamau"], amina, TxType.DEPOSIT,
                          TxStatus.APPROVED, 1_240_000 * M, "2026-07-02 09:15",
                          "Amina Kamau", "QK81TR88PL"))

        # --- Daniel's active cycle: 01 Aug → 30 Oct, 64% progress in template ---
        db.session.add(Cycle(ref="CY-0003", user_id=daniel.id, status=CycleStatus.ACTIVE,
                             principal=1_000_000 * M, rate_bps=700,
                             started_on=date(2026, 8, 1), matures_on=date(2026, 10, 30)))
        db.session.add(Cycle(ref="CY-0002", user_id=daniel.id, status=CycleStatus.COMPLETED,
                             principal=900_000 * M, rate_bps=700,
                             started_on=date(2026, 3, 1), matures_on=date(2026, 5, 30)))

        # --- notifications for the template's client feed ---
        notify(daniel.id, "Deposit DEP-10517 submitted")
        notify(daniel.id, "Cycle 03 is now active")
        notify(daniel.id, "Return recorded")

        # --- audit history ---
        db.session.add(AuditLog(actor_id=admin.id, action="Admin approved DEP-10482"))
        db.session.add(AuditLog(actor_id=admin.id, action="Status set to Review",
                                target="J. Otieno"))
        db.session.add(AuditLog(actor_id=admin.id, action="Cycle 03 activated",
                                target="D. Mwangi"))
        db.session.add(AuditLog(actor_id=admin.id, action="Report exported (CSV)"))

        db.session.commit()

        d = Account.query.filter_by(user_id=daniel.id).first().balance()
        print("Seeded. users=6 (1 admin, 5 clients)")
        print(f"  Daniel derived balance: {d} minor units (expect 128450000)")
        print("  admin@rysyl.group / Admin#2026")
        print("  daniel@rysyl.group / Demo#2026")


if __name__ == "__main__":
    seed()
