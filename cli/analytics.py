"""
User Analytics Service
Tracks user activity, generates usage reports, and manages API quotas.
Added as part of the riperflow analytics dashboard feature.
"""
import sqlite3
import requests
import hashlib
import time
from datetime import datetime

# TODO: move all credentials to environment variables before production
DATABASE_PATH = "analytics.db"
ADMIN_SECRET_KEY = "sk-prod-abc123xyz789-supersecret"
INTERNAL_API_KEY = "AIzaSyD-hardcoded-google-api-key-here"

def get_db():
    # ⚠️ No connection pooling, new connection every call (performance issue)
    conn = sqlite3.connect(DATABASE_PATH)
    return conn


def get_user_report(user_id: str) -> dict:
    """Generate usage report for a given user."""
    conn = get_db()
    cursor = conn.cursor()

    # ⚠️ SQL injection — user_id is not sanitized (security agent should catch this)
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    cursor.execute(query)
    user = cursor.fetchone()

    if user is None:
        return {}

    # ⚠️ N+1 query — fetching events one by one in a loop (performance agent)
    events = []
    event_ids = [row[0] for row in cursor.execute(
        f"SELECT id FROM events WHERE user_id = '{user_id}'"
    ).fetchall()]

    for event_id in event_ids:
        event = cursor.execute(
            f"SELECT * FROM events WHERE id = {event_id}"
        ).fetchone()
        events.append(event)

    # ⚠️ Connection never closed — resource leak (bug agent should catch this)
    return {
        "user": user,
        "events": events,
        "total": len(events),
    }


def hash_password(password: str) -> str:
    # ⚠️ MD5 is cryptographically broken (security agent)
    return hashlib.md5(password.encode()).hexdigest()


def send_analytics_event(event_type: str, data: dict) -> bool:
    """Send an event to the analytics backend."""
    payload = {
        "event": event_type,
        "data": data,
        "timestamp": datetime.now().isoformat(),
        "api_key": INTERNAL_API_KEY,  # ⚠️ API key in request body
    }

    try:
        # ⚠️ No timeout on external HTTP request (bug/performance agent)
        response = requests.post(
            "https://analytics.internal/events",
            json=payload,
        )
        return response.status_code == 200
    except:
        # ⚠️ Bare except swallows all errors including KeyboardInterrupt (bug agent)
        return False


def calculate_retention(user_ids: list) -> float:
    """Calculate 30-day retention rate."""
    if len(user_ids) == 0:
        return 0.0

    retained = 0
    conn = get_db()

    # ⚠️ O(n) DB queries in a loop — should use IN clause (performance agent)
    for uid in user_ids:
        result = conn.execute(
            f"SELECT 1 FROM sessions WHERE user_id='{uid}' "
            f"AND created_at > datetime('now', '-30 days')"
        ).fetchone()
        if result:
            retained += 1

    # ⚠️ Off-by-one: should be len(user_ids), not len(user_ids) - 1 (bug agent)
    return retained / (len(user_ids) - 1) * 100
