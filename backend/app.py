"""
PROBALAJI AI — Secure Backend API
==================================
Flask REST API serving both the customer site and admin site.
All sensitive operations are protected with JWT Bearer tokens.

Endpoints (public):
  POST /api/check-serial         — Customer warranty lookup
  POST /api/complaints           — Customer complaint submission

Endpoints (protected — requires JWT):
  POST /api/admin/login          — Get JWT token
  GET  /api/admin/batteries      — Full battery/warranty registry
  POST /api/admin/batteries      — Add new battery/warranty record
  POST /api/admin/batteries/<serial>/card-given — Mark warranty card given
  GET  /api/admin/complaints     — All service complaints
  PATCH /api/admin/complaints/<id> — Update complaint status
  DELETE /api/admin/complaints/<id> — Delete complaint

Run:
  python app.py
"""

import os
import sqlite3
import datetime
from pathlib import Path

from flask import Flask, jsonify, request, g
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity
)
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

# ── Load environment variables from .env ──────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

# ── App Setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)

# JWT configuration
jwt_secret = os.getenv("JWT_SECRET_KEY", "")
if not jwt_secret or jwt_secret.startswith("CHANGE_ME"):
    raise RuntimeError(
        "\n\n[PROBALAJI] ERROR: JWT_SECRET_KEY is not set or is still the placeholder.\n"
        "  1. Open backend/.env\n"
        "  2. Replace the JWT_SECRET_KEY value with a real random key.\n"
        "  3. Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
    )

app.config["JWT_SECRET_KEY"] = jwt_secret
# Tokens valid for 8 hours (one working day)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=8)

jwt = JWTManager(app)

# CORS — allow the frontend origins to call this API
allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")
CORS(app, resources={r"/api/*": {"origins": allowed_origin}}, supports_credentials=True)

# ── Database Setup ─────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "database.db"


def get_db():
    """Return a thread-local database connection."""
    if "db" not in g:
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row  # rows behave like dicts
        g.db.execute("PRAGMA journal_mode=WAL")  # better concurrency
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create tables if they don't exist, and seed the admin user."""
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    cur = db.cursor()

    # ── batteries table ──────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS batteries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            serial      TEXT    UNIQUE NOT NULL,
            name        TEXT    NOT NULL DEFAULT '',
            phone       TEXT    NOT NULL DEFAULT '',
            address     TEXT    NOT NULL DEFAULT '',
            product     TEXT    NOT NULL DEFAULT '',
            brand       TEXT    NOT NULL DEFAULT '',
            date        TEXT    NOT NULL DEFAULT '',
            duration    INTEGER NOT NULL DEFAULT 24,
            card_given  TEXT    NOT NULL DEFAULT 'No',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── complaints table ─────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id          TEXT    PRIMARY KEY,
            name        TEXT    NOT NULL DEFAULT '',
            phone       TEXT    NOT NULL DEFAULT '',
            address     TEXT    NOT NULL DEFAULT '',
            product     TEXT    NOT NULL DEFAULT '',
            brand       TEXT    NOT NULL DEFAULT '',
            serial      TEXT    NOT NULL DEFAULT '',
            details     TEXT    NOT NULL DEFAULT '',
            status      TEXT    NOT NULL DEFAULT 'pending',
            timestamp   TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # ── admin_users table ────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL
        )
    """)

    # ── Seed default admin if no users exist ────────────────────────────────
    row = cur.execute("SELECT COUNT(*) FROM admin_users").fetchone()
    if row[0] == 0:
        admin_user = os.getenv("ADMIN_USERNAME", "admin")
        admin_pass = os.getenv("ADMIN_PASSWORD", "Probalaji@2026")
        hashed = generate_password_hash(admin_pass)
        cur.execute(
            "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
            (admin_user, hashed)
        )
        print(f"[PROBALAJI] Seeded default admin user: '{admin_user}'")
        print("[PROBALAJI] ⚠  Change the default password immediately!")

    db.commit()
    db.close()


# ── Helper utilities ──────────────────────────────────────────────────────────
def row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict."""
    return dict(row)


def battery_public_view(row):
    """
    Return only the fields that customers are allowed to see.
    Phone and address are NOT included in the public response.
    """
    d = row_to_dict(row)
    return {
        "serial":    d.get("serial", ""),
        "name":      d.get("name", ""),
        "product":   d.get("product", ""),
        "brand":     d.get("brand", ""),
        "date":      d.get("date", ""),
        "duration":  d.get("duration", 0),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PUBLIC ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/check-serial", methods=["POST"])
def check_serial():
    """
    Public endpoint: customer sends a serial number, gets back only
    that battery's warranty info. No other customer's data is exposed.
    """
    body = request.get_json(silent=True) or {}
    serial = str(body.get("serial", "")).strip().upper()

    if not serial:
        return jsonify({"status": "error", "message": "Serial number is required."}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM batteries WHERE UPPER(serial) = ?", (serial,)
    ).fetchone()

    if row is None:
        return jsonify({
            "status": "not_found",
            "message": f"No warranty record found for serial number '{serial}'."
        }), 404

    return jsonify({"status": "found", "battery": battery_public_view(row)}), 200


@app.route("/api/complaints", methods=["POST"])
def submit_complaint():
    """
    Public endpoint: customer submits a service complaint ticket.
    Basic validation is applied. No auth required.
    """
    body = request.get_json(silent=True) or {}
    name    = str(body.get("name", "")).strip()
    phone   = str(body.get("phone", "")).strip()
    address = str(body.get("address", "")).strip()
    product = str(body.get("product", "")).strip()
    brand   = str(body.get("brand", "")).strip()
    serial  = str(body.get("serial", "")).strip()
    details = str(body.get("details", "")).strip()

    if not name or not phone or not serial or not details:
        return jsonify({
            "status": "error",
            "message": "Missing required fields: name, phone, serial, details."
        }), 400

    import random
    ticket_id = f"TCK-{random.randint(1000, 9999)}"
    timestamp = datetime.datetime.utcnow().isoformat()

    db = get_db()
    try:
        db.execute(
            """INSERT INTO complaints
               (id, name, phone, address, product, brand, serial, details, status, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (ticket_id, name, phone, address, product, brand, serial, details, timestamp)
        )
        db.commit()
    except sqlite3.IntegrityError:
        # Extremely unlikely (random ID collision) — retry once
        ticket_id = f"TCK-{random.randint(1000, 9999)}-{random.randint(10, 99)}"
        db.execute(
            """INSERT INTO complaints
               (id, name, phone, address, product, brand, serial, details, status, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (ticket_id, name, phone, address, product, brand, serial, details, timestamp)
        )
        db.commit()

    return jsonify({
        "status": "success",
        "ticket_id": ticket_id,
        "timestamp": timestamp,
        "message": "Complaint registered successfully."
    }), 201


# ═════════════════════════════════════════════════════════════════════════════
#  ADMIN AUTH ENDPOINT
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """
    Admin login. Accepts username + password, verifies the bcrypt hash
    stored in the database, returns a JWT access token on success.
    Passwords are NEVER compared as plain text.
    """
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", "")).strip()

    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM admin_users WHERE username = ?", (username,)
    ).fetchone()

    # Always do a hash check (even on miss) to prevent timing attacks
    stored_hash = row["password_hash"] if row else generate_password_hash("dummy")
    if row is None or not check_password_hash(stored_hash, password):
        return jsonify({"status": "error", "message": "Invalid username or password."}), 401

    # Create JWT — identity is the username
    access_token = create_access_token(identity=username)
    return jsonify({
        "status": "success",
        "access_token": access_token,
        "username": username
    }), 200


# ═════════════════════════════════════════════════════════════════════════════
#  PROTECTED ADMIN ENDPOINTS — all require @jwt_required()
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/api/admin/batteries", methods=["GET"])
@jwt_required()
def get_batteries():
    """Return full battery/warranty registry. Admin only."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM batteries ORDER BY created_at DESC"
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows]), 200


@app.route("/api/admin/batteries", methods=["POST"])
@jwt_required()
def add_battery():
    """Add or update a battery/warranty record. Admin only."""
    body = request.get_json(silent=True) or {}
    serial   = str(body.get("serial", "")).strip().upper()
    name     = str(body.get("name", "")).strip()
    phone    = str(body.get("phone", "")).strip()
    address  = str(body.get("address", "")).strip()
    product  = str(body.get("product", "")).strip()
    brand    = str(body.get("brand", "")).strip()
    date     = str(body.get("date", "")).strip()
    duration = int(body.get("duration", 24))
    card_given = "Yes" if str(body.get("card_given", "No")).strip() == "Yes" else "No"

    if not serial or not name:
        return jsonify({"status": "error", "message": "serial and name are required."}), 400

    db = get_db()
    try:
        db.execute(
            """INSERT INTO batteries
               (serial, name, phone, address, product, brand, date, duration, card_given, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(serial) DO UPDATE SET
                 name=excluded.name, phone=excluded.phone, address=excluded.address,
                 product=excluded.product, brand=excluded.brand, date=excluded.date,
                 duration=excluded.duration""",
            (serial, name, phone, address, product, brand, date, duration, card_given)
        )
        db.commit()
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "success", "serial": serial}), 201


@app.route("/api/admin/batteries/<serial>/card-given", methods=["POST"])
@jwt_required()
def mark_card_given(serial):
    """Mark warranty card as physically handed to customer. Irreversible. Admin only."""
    serial = serial.upper()
    db = get_db()
    row = db.execute(
        "SELECT card_given FROM batteries WHERE UPPER(serial) = ?", (serial,)
    ).fetchone()

    if row is None:
        return jsonify({"status": "error", "message": "Battery record not found."}), 404

    if row["card_given"] == "Yes":
        return jsonify({
            "status": "error",
            "message": "Card status is already locked as 'Handed Over'."
        }), 409

    db.execute(
        "UPDATE batteries SET card_given = 'Yes' WHERE UPPER(serial) = ?", (serial,)
    )
    db.commit()
    return jsonify({"status": "success", "message": "Warranty card status locked."}), 200


@app.route("/api/admin/complaints", methods=["GET"])
@jwt_required()
def get_complaints():
    """Return all service complaints. Admin only."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM complaints ORDER BY timestamp DESC"
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows]), 200


@app.route("/api/admin/complaints/<ticket_id>", methods=["PATCH"])
@jwt_required()
def update_complaint(ticket_id):
    """Update complaint status (pending / in-progress / resolved). Admin only."""
    body = request.get_json(silent=True) or {}
    new_status = str(body.get("status", "")).strip()
    allowed = {"pending", "in-progress", "resolved"}
    if new_status not in allowed:
        return jsonify({
            "status": "error",
            "message": f"status must be one of: {', '.join(allowed)}"
        }), 400

    db = get_db()
    result = db.execute(
        "UPDATE complaints SET status = ? WHERE id = ?", (new_status, ticket_id)
    )
    if result.rowcount == 0:
        return jsonify({"status": "error", "message": "Complaint not found."}), 404
    db.commit()
    return jsonify({"status": "success", "id": ticket_id, "new_status": new_status}), 200


@app.route("/api/admin/complaints/<ticket_id>", methods=["DELETE"])
@jwt_required()
def delete_complaint(ticket_id):
    """Delete a complaint ticket. Admin only."""
    db = get_db()
    result = db.execute("DELETE FROM complaints WHERE id = ?", (ticket_id,))
    if result.rowcount == 0:
        return jsonify({"status": "error", "message": "Complaint not found."}), 404
    db.commit()
    return jsonify({"status": "success", "message": f"Ticket {ticket_id} deleted."}), 200


# ── JWT error handlers ─────────────────────────────────────────────────────────
@jwt.unauthorized_loader
def unauthorized_callback(reason):
    return jsonify({"status": "error", "message": "Authorization required.", "reason": reason}), 401


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"status": "error", "message": "Session expired. Please log in again."}), 401


@jwt.invalid_token_loader
def invalid_token_callback(reason):
    return jsonify({"status": "error", "message": "Invalid token.", "reason": reason}), 422


# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "PROBALAJI AI Backend"}), 200


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("=" * 60)
    print("  PROBALAJI AI — Secure Backend API")
    print("=" * 60)

    # Initialise DB tables and seed admin if needed
    init_db()

    port = int(os.getenv("FLASK_PORT", 5000))
    print(f"  API running at: http://localhost:{port}")
    print(f"  Health check:  http://localhost:{port}/api/health")
    print("=" * 60)

    app.run(host="0.0.0.0", port=port, debug=False)
