"""
db.py — MySQL version (migrated from SQLite)
Database: MySQL via PyMySQL
"""

import pymysql
import pymysql.cursors
import hashlib
import os

# ─── Connection Config ───────────────────────────────────────────────────────
# Edit these values to match your MySQL setup.
# For production/hosting, prefer environment variables.
DB_CONFIG = {
    "host":     os.getenv("MYSQL_HOST",     "localhost"),
    "port":     int(os.getenv("MYSQL_PORT", "3306")),
    "user":     os.getenv("MYSQL_USER",     "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DATABASE", "tlc_trading"),
    "charset":  "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,  # rows returned as dict
}

def get_db_connection():
    """Open and return a new PyMySQL connection."""
    return pymysql.connect(**DB_CONFIG)

# ─── Bootstrap: create database + tables if not exist ────────────────────────

def ensure_database():
    """Create the 'tlc_trading' database if it doesn't already exist."""
    cfg = {k: v for k, v in DB_CONFIG.items() if k != "database" and k != "cursorclass"}
    cfg["cursorclass"] = pymysql.cursors.DictCursor
    conn = pymysql.connect(**cfg)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{DB_CONFIG['database']}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        conn.commit()
    finally:
        conn.close()

def init_db():
    ensure_database()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:

            # stocks
            cur.execute("""
            CREATE TABLE IF NOT EXISTS stocks (
                id     INT AUTO_INCREMENT PRIMARY KEY,
                ticker VARCHAR(20)  NOT NULL UNIQUE,
                name   VARCHAR(200) NOT NULL,
                sector VARCHAR(100)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # historical_prices
            cur.execute("""
            CREATE TABLE IF NOT EXISTS historical_prices (
                id        INT AUTO_INCREMENT PRIMARY KEY,
                stock_id  INT         NOT NULL,
                date      VARCHAR(30) NOT NULL,
                timestamp BIGINT      NOT NULL,
                open      DOUBLE      NOT NULL,
                high      DOUBLE      NOT NULL,
                low       DOUBLE      NOT NULL,
                close     DOUBLE      NOT NULL,
                adj_close DOUBLE,
                volume    BIGINT      NOT NULL,
                timeframe VARCHAR(10) NOT NULL DEFAULT 'd1',
                FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE,
                UNIQUE KEY uq_price (stock_id, date, timeframe)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # cash_balance
            cur.execute("""
            CREATE TABLE IF NOT EXISTS cash_balance (
                id   INT    PRIMARY KEY,
                cash DOUBLE NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # seed cash balance
            cur.execute("SELECT COUNT(*) AS cnt FROM cash_balance")
            if cur.fetchone()["cnt"] == 0:
                cur.execute("INSERT INTO cash_balance (id, cash) VALUES (1, 10000000.0)")

            # portfolio
            cur.execute("""
            CREATE TABLE IF NOT EXISTS portfolio (
                stock_id  INT    PRIMARY KEY,
                lots      INT    NOT NULL,
                avg_price DOUBLE NOT NULL,
                FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # trading_journal
            cur.execute("""
            CREATE TABLE IF NOT EXISTS trading_journal (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                date         VARCHAR(20) NOT NULL,
                ticker       VARCHAR(20) NOT NULL,
                type         VARCHAR(10) NOT NULL,
                price        DOUBLE      NOT NULL,
                lots         INT         NOT NULL,
                setup        TEXT,
                notes        TEXT,
                target_price DOUBLE,
                stop_loss    DOUBLE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # users
            cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                username      VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(64)  NOT NULL,
                full_name     VARCHAR(200),
                role          VARCHAR(20)  NOT NULL DEFAULT 'user',
                created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # seed admin user  (password: admin123)
            admin_hash = hashlib.sha256(b"admin123").hexdigest()
            cur.execute(
                """
                INSERT IGNORE INTO users (username, password_hash, full_name, role)
                VALUES (%s, %s, %s, %s)
                """,
                ("admin", admin_hash, "Administrator", "admin"),
            )

        conn.commit()
    finally:
        conn.close()


# ─── Stock helpers ────────────────────────────────────────────────────────────

def add_stock(ticker, name, sector=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO stocks (ticker, name, sector) VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE name = VALUES(name), sector = VALUES(sector)
                """,
                (ticker, name, sector),
            )
            conn.commit()
            cur.execute("SELECT id FROM stocks WHERE ticker = %s", (ticker,))
            return cur.fetchone()["id"]
    finally:
        conn.close()


def get_stocks():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM stocks ORDER BY ticker ASC")
            return cur.fetchall()
    finally:
        conn.close()


def get_stock_by_ticker(ticker):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM stocks WHERE ticker = %s", (ticker,))
            return cur.fetchone()
    finally:
        conn.close()


# ─── Price helpers ────────────────────────────────────────────────────────────

def insert_prices(stock_id, prices_data):
    """
    prices_data: list of dicts with keys:
      date, timestamp, open, high, low, close, adj_close, volume, timeframe
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO historical_prices
                    (stock_id, date, timestamp, open, high, low, close, adj_close, volume, timeframe)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    timestamp = VALUES(timestamp),
                    open      = VALUES(open),
                    high      = VALUES(high),
                    low       = VALUES(low),
                    close     = VALUES(close),
                    adj_close = VALUES(adj_close),
                    volume    = VALUES(volume)
                """,
                [
                    (
                        stock_id,
                        p["date"],
                        p["timestamp"],
                        p["open"],
                        p["high"],
                        p["low"],
                        p["close"],
                        p.get("adj_close"),
                        p["volume"],
                        p.get("timeframe", "d1"),
                    )
                    for p in prices_data
                ],
            )
        conn.commit()
    finally:
        conn.close()


def get_historical_prices(stock_id, timeframe="d1"):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT date, timestamp, open, high, low, close, adj_close, volume, timeframe
                FROM historical_prices
                WHERE stock_id = %s AND timeframe = %s
                ORDER BY timestamp ASC
                """,
                (stock_id, timeframe),
            )
            return cur.fetchall()
    finally:
        conn.close()


# ─── Portfolio helpers ────────────────────────────────────────────────────────

def get_cash_balance():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT cash FROM cash_balance WHERE id = 1")
            row = cur.fetchone()
            return row["cash"] if row else 10_000_000.0
    finally:
        conn.close()


def get_portfolio():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.stock_id, p.lots, p.avg_price, s.ticker, s.name, s.sector
                FROM portfolio p
                JOIN stocks s ON p.stock_id = s.id
                WHERE p.lots > 0
                """
            )
            return cur.fetchall()
    finally:
        conn.close()


def reset_simulation_account():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE cash_balance SET cash = 10000000.0 WHERE id = 1")
            cur.execute("DELETE FROM portfolio")
        conn.commit()
    finally:
        conn.close()


def execute_trade(ticker, trade_type, lots, price):
    if lots <= 0:
        return {"status": "error", "message": "Jumlah lot harus lebih dari 0"}

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Get stock ID
            cur.execute("SELECT id FROM stocks WHERE ticker = %s", (ticker,))
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": f"Saham {ticker} tidak ditemukan di database"}
            stock_id = row["id"]

            # Get current cash
            cur.execute("SELECT cash FROM cash_balance WHERE id = 1")
            cash = cur.fetchone()["cash"]
            total_value = lots * 100 * price

            if trade_type == "BUY":
                if cash < total_value:
                    return {"status": "error", "message": f"Dana tidak cukup. Dibutuhkan Rp {total_value:,.2f}, Saldo Anda Rp {cash:,.2f}"}

                cur.execute("UPDATE cash_balance SET cash = %s WHERE id = 1", (cash - total_value,))

                cur.execute("SELECT lots, avg_price FROM portfolio WHERE stock_id = %s", (stock_id,))
                holding = cur.fetchone()

                if holding:
                    old_lots = holding["lots"]
                    old_avg  = holding["avg_price"]
                    new_lots = old_lots + lots
                    new_avg  = ((old_lots * 100 * old_avg) + total_value) / (new_lots * 100)
                    cur.execute(
                        "UPDATE portfolio SET lots = %s, avg_price = %s WHERE stock_id = %s",
                        (new_lots, new_avg, stock_id),
                    )
                else:
                    cur.execute(
                        "INSERT INTO portfolio (stock_id, lots, avg_price) VALUES (%s, %s, %s)",
                        (stock_id, lots, price),
                    )

                conn.commit()
                return {"status": "success", "message": f"Berhasil membeli {lots} lot {ticker.replace('.JK','')} di harga Rp {price:,.2f}"}

            elif trade_type == "SELL":
                cur.execute("SELECT lots, avg_price FROM portfolio WHERE stock_id = %s", (stock_id,))
                holding = cur.fetchone()

                if not holding or holding["lots"] < lots:
                    owned = holding["lots"] if holding else 0
                    return {"status": "error", "message": f"Jumlah saham tidak cukup. Anda hanya memiliki {owned} lot {ticker.replace('.JK','')}"}

                old_lots = holding["lots"]
                new_lots = old_lots - lots
                cur.execute("UPDATE cash_balance SET cash = %s WHERE id = 1", (cash + total_value,))

                if new_lots == 0:
                    cur.execute("DELETE FROM portfolio WHERE stock_id = %s", (stock_id,))
                else:
                    cur.execute("UPDATE portfolio SET lots = %s WHERE stock_id = %s", (new_lots, stock_id))

                conn.commit()
                return {"status": "success", "message": f"Berhasil menjual {lots} lot {ticker.replace('.JK','')} di harga Rp {price:,.2f}"}

            else:
                return {"status": "error", "message": "Jenis transaksi tidak valid"}

    except Exception as e:
        return {"status": "error", "message": f"Database error: {str(e)}"}
    finally:
        conn.close()


# ─── Trading Journal helpers ──────────────────────────────────────────────────

def get_journal_entries():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM trading_journal ORDER BY date DESC, id DESC")
            return cur.fetchall()
    finally:
        conn.close()


def add_journal_entry(date, ticker, trade_type, price, lots,
                      setup=None, notes=None, target_price=None, stop_loss=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO trading_journal
                    (date, ticker, type, price, lots, setup, notes, target_price, stop_loss)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (date, ticker.upper(), trade_type.upper(), price, lots,
                 setup, notes, target_price, stop_loss),
            )
            conn.commit()
            return cur.lastrowid
    finally:
        conn.close()


def delete_journal_entry(entry_id):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM trading_journal WHERE id = %s", (entry_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()


def get_user_by_username(username: str):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            return cur.fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            return cur.fetchone()
    finally:
        conn.close()


def verify_password(username: str, plain_password: str):
    """Returns user dict if credentials valid, else None."""
    user = get_user_by_username(username)
    if not user:
        return None
    if user["password_hash"] == hash_password(plain_password):
        return user
    return None
