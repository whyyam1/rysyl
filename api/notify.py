"""Notification service — records in DB always; email is additive, never blocking.

MVP notifications are email-only per the proposal, but SMTP credentials are not
guaranteed in dev, so failures are swallowed (logged) after the DB row is committed.
"""
import logging

from .extensions import db
from .models import Notification, utcnow

log = logging.getLogger("rysyl.notify")


def notify(user_id: int, body: str) -> None:
    """Persist an in-app notification (source of truth for the dashboard feed)."""
    db.session.add(Notification(user_id=user_id, body=body))


def send_email(to: str, subject: str, body: str) -> None:
    """Best-effort SMTP send; never raises. Email-only MVP channel (proposal §8.6)."""
    import os
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        log.info("email skipped (no SMTP_HOST): to=%s subject=%s", to, subject)
        return
    try:
        import smtplib
        from email.message import EmailMessage
        msg = EmailMessage()
        msg["From"] = os.environ.get("MAIL_FROM", "ops@rysyl.group")
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=10) as s:
            s.starttls()
            if os.environ.get("SMTP_USER"):
                s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
            s.send_message(msg)
    except Exception as exc:  # pragma: no cover - env dependent
        log.warning("email send failed: %s", exc)


def notify_and_email(user, body: str, email_subject: str | None = None) -> None:
    notify(user.id, body)
    if email_subject:
        send_email(user.email, email_subject, body)
