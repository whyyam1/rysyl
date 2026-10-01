"""Append-only audit trail. Every privileged action goes through here."""
from .extensions import db
from .models import AuditLog


def record(actor_id: int | None, action: str, target: str | None = None,
           detail: str | None = None) -> AuditLog:
    """Append one audit row. Never update, never delete."""
    row = AuditLog(actor_id=actor_id, action=action, target=target, detail=detail)
    db.session.add(row)
    return row
