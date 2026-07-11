"""
PROBALAJI AI — Database Migration Script
=========================================
One-time script to import existing data from:
  - pending_backup.json         (was empty)
  - pending_card_updates.json   (was empty)
  - warranty_registry_backup.xlsx (may contain warranty records)

Writes all records into the new SQLite database (backend/database.db).

Run from the PROJECT ROOT:
  python backend/migrate.py

Run from inside backend/:
  python migrate.py
"""

import json
import sqlite3
import sys
from pathlib import Path

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent           # backend/
PROJECT_DIR  = SCRIPT_DIR.parent               # project root

DB_PATH      = SCRIPT_DIR / "database.db"
XLSX_PATH    = PROJECT_DIR / "warranty_registry_backup.xlsx"
BACKUP_JSON  = PROJECT_DIR / "pending_backup.json"
CARD_JSON    = PROJECT_DIR / "pending_card_updates.json"


# ── SQLite helpers ────────────────────────────────────────────────────────────
def get_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables(conn):
    """Create tables if they don't exist (same schema as app.py)."""
    cur = conn.cursor()
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id        TEXT    PRIMARY KEY,
            name      TEXT    NOT NULL DEFAULT '',
            phone     TEXT    NOT NULL DEFAULT '',
            address   TEXT    NOT NULL DEFAULT '',
            product   TEXT    NOT NULL DEFAULT '',
            brand     TEXT    NOT NULL DEFAULT '',
            serial    TEXT    NOT NULL DEFAULT '',
            details   TEXT    NOT NULL DEFAULT '',
            status    TEXT    NOT NULL DEFAULT 'pending',
            timestamp TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    UNIQUE NOT NULL,
            password_hash TEXT    NOT NULL
        )
    """)
    conn.commit()


# ── XLSX migration ────────────────────────────────────────────────────────────
def migrate_xlsx(conn):
    """Read warranty_registry_backup.xlsx and insert rows into batteries table."""
    if not XLSX_PATH.exists():
        print(f"  [SKIP] {XLSX_PATH.name} not found — nothing to import from Excel.")
        return 0

    try:
        import openpyxl
    except ImportError:
        print("  [WARN] openpyxl not installed. Run: pip install openpyxl")
        print("         Skipping Excel migration.")
        return 0

    wb = openpyxl.load_workbook(str(XLSX_PATH), read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        print(f"  [SKIP] {XLSX_PATH.name} is empty.")
        return 0

    # Detect header row
    header_row = [str(h).strip().lower() if h is not None else "" for h in rows[0]]
    print(f"  [XLSX] Detected columns: {header_row}")

    # Map common column name variants to our schema fields
    col_map = {
        "serial":     ["serial", "serial number", "serialno", "serial_number", "sno", "s.no"],
        "name":       ["name", "customer name", "customer_name", "buyer", "owner"],
        "phone":      ["phone", "mobile", "phone number", "mobile number", "contact"],
        "address":    ["address", "installation address", "addr", "service address"],
        "product":    ["product", "model", "product model", "item"],
        "brand":      ["brand", "manufacturer", "make", "brand name"],
        "date":       ["date", "purchase date", "date of purchase", "bought on"],
        "duration":   ["duration", "warranty", "warranty months", "warranty period", "months", "warranty duration (months)"],
        "card_given": ["card given", "card_given", "cardgiven", "warranty card"],
    }

    def find_col(field):
        variants = col_map.get(field, [])
        for idx, h in enumerate(header_row):
            if h in variants:
                return idx
        return None

    idx = {field: find_col(field) for field in col_map}
    print(f"  [XLSX] Column index mapping: {idx}")

    inserted = 0
    skipped  = 0
    cur = conn.cursor()

    for row_num, row in enumerate(rows[1:], start=2):  # skip header
        serial = str(row[idx["serial"]] or "").strip().upper() if idx["serial"] is not None else ""
        if not serial:
            skipped += 1
            continue

        def get_val(field, default=""):
            i = idx.get(field)
            return str(row[i] or default).strip() if i is not None else default

        name      = get_val("name")
        phone     = get_val("phone")
        address   = get_val("address")
        product   = get_val("product")
        brand     = get_val("brand")
        date      = get_val("date")
        card_str  = get_val("card_given", "No")
        card_given = "Yes" if card_str.lower() in ("yes", "true", "1", "handed", "given") else "No"

        # Normalise duration to integer months
        dur_raw = get_val("duration", "24")
        try:
            duration = int(float(dur_raw))
        except (ValueError, TypeError):
            duration = 24

        try:
            cur.execute(
                """INSERT INTO batteries
                   (serial, name, phone, address, product, brand, date, duration, card_given)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(serial) DO UPDATE SET
                     name=excluded.name, phone=excluded.phone,
                     address=excluded.address, product=excluded.product,
                     brand=excluded.brand, date=excluded.date,
                     duration=excluded.duration""",
                (serial, name, phone, address, product, brand, date, duration, card_given)
            )
            inserted += 1
        except Exception as e:
            print(f"  [WARN] Row {row_num}: {e}")
            skipped += 1

    conn.commit()
    print(f"  [XLSX] Done — inserted/updated: {inserted}, skipped: {skipped}")
    return inserted


# ── JSON backup migration ─────────────────────────────────────────────────────
def migrate_json_warranties(conn):
    """Import pending_backup.json into the batteries table."""
    if not BACKUP_JSON.exists():
        print(f"  [SKIP] {BACKUP_JSON.name} not found.")
        return 0

    with open(BACKUP_JSON, encoding="utf-8") as f:
        records = json.load(f)

    if not records:
        print(f"  [SKIP] {BACKUP_JSON.name} is empty.")
        return 0

    cur = conn.cursor()
    inserted = 0
    for r in records:
        serial = str(r.get("serial", "")).strip().upper()
        if not serial:
            continue
        try:
            cur.execute(
                """INSERT INTO batteries
                   (serial, name, phone, address, product, brand, date, duration, card_given)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(serial) DO NOTHING""",
                (
                    serial,
                    r.get("name", ""),
                    r.get("phone", ""),
                    r.get("address", ""),
                    r.get("product", ""),
                    r.get("brand", ""),
                    r.get("date", ""),
                    int(r.get("duration", 24)),
                    "Yes" if r.get("cardGiven") == "Yes" else "No",
                )
            )
            inserted += 1
        except Exception as e:
            print(f"  [WARN] {serial}: {e}")

    conn.commit()
    print(f"  [JSON] pending_backup.json — inserted: {inserted}")
    return inserted


def migrate_json_card_updates(conn):
    """Apply card_given updates from pending_card_updates.json."""
    if not CARD_JSON.exists():
        print(f"  [SKIP] {CARD_JSON.name} not found.")
        return 0

    with open(CARD_JSON, encoding="utf-8") as f:
        updates = json.load(f)

    if not updates:
        print(f"  [SKIP] {CARD_JSON.name} is empty.")
        return 0

    cur = conn.cursor()
    updated = 0
    for u in updates:
        serial = str(u.get("serial", "")).strip().upper()
        if serial:
            cur.execute(
                "UPDATE batteries SET card_given='Yes' WHERE UPPER(serial)=?", (serial,)
            )
            updated += 1

    conn.commit()
    print(f"  [JSON] pending_card_updates.json — updated card status: {updated}")
    return updated


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  PROBALAJI AI — Database Migration")
    print("=" * 60)
    print(f"  Database: {DB_PATH}")
    print()

    conn = get_connection()
    ensure_tables(conn)
    print("  [OK] Database tables ready.\n")

    print("  [1/3] Importing from Excel backup...")
    migrate_xlsx(conn)
    print()

    print("  [2/3] Importing from pending_backup.json...")
    migrate_json_warranties(conn)
    print()

    print("  [3/3] Applying pending card updates...")
    migrate_json_card_updates(conn)
    print()

    # Final counts
    cur = conn.cursor()
    bat_count  = cur.execute("SELECT COUNT(*) FROM batteries").fetchone()[0]
    comp_count = cur.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
    conn.close()

    print("=" * 60)
    print(f"  Migration complete!")
    print(f"  Batteries in database : {bat_count}")
    print(f"  Complaints in database: {comp_count}")
    print()
    print("  Next step: python backend/app.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
