import sqlite3
import pymysql
import os
import db

def migrate():
    # 1. Initialize the MySQL database schema
    print("Initializing MySQL database schema...")
    db.init_db()

    # 2. Paths and connections
    sqlite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
    if not os.path.exists(sqlite_path):
        print(f"SQLite database not found at {sqlite_path}. Cannot migrate.")
        return

    print("Connecting to SQLite database...")
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()

    print("Connecting to MySQL database...")
    mysql_conn = db.get_db_connection()
    mysql_cur = mysql_conn.cursor()

    try:
        # Disable foreign key checks for the session to safely insert data
        mysql_cur.execute("SET FOREIGN_KEY_CHECKS = 0;")

        tables = ["stocks", "historical_prices", "cash_balance", "portfolio", "trading_journal", "users"]

        for table in tables:
            print(f"Migrating table '{table}'...")
            
            # Read from SQLite
            sqlite_cur.execute(f"SELECT * FROM `{table}`")
            rows = sqlite_cur.fetchall()
            if not rows:
                print(f"Table '{table}' is empty in SQLite. Skipping.")
                continue

            # Get column names
            cols = list(rows[0].keys())
            col_list = ", ".join([f"`{c}`" for c in cols])
            placeholders = ", ".join(["%s"] * len(cols))
            
            # Build ON DUPLICATE KEY UPDATE clause
            update_clauses = []
            for c in cols:
                # We skip primary keys (like id or stock_id for single-pk tables) to avoid errors
                # and only update non-key columns if a record with the same primary key already exists.
                if c not in ["id", "stock_id"]:
                    update_clauses.append(f"`{c}` = VALUES(`{c}`)")
            
            if update_clauses:
                update_str = " ON DUPLICATE KEY UPDATE " + ", ".join(update_clauses)
            else:
                # If there are no other columns, just INSERT IGNORE
                update_str = ""

            # Prepare statement
            if update_str:
                insert_sql = f"INSERT INTO `{table}` ({col_list}) VALUES ({placeholders}){update_str}"
            else:
                insert_sql = f"INSERT IGNORE INTO `{table}` ({col_list}) VALUES ({placeholders})"

            # Insert in chunks
            chunk_size = 1000
            data_to_insert = [tuple(row) for row in rows]
            
            for i in range(0, len(data_to_insert), chunk_size):
                chunk = data_to_insert[i:i + chunk_size]
                mysql_cur.executemany(insert_sql, chunk)
                mysql_conn.commit()
                
            print(f"Successfully migrated {len(data_to_insert)} rows for table '{table}'.")

    except Exception as e:
        print(f"An error occurred during migration: {e}")
        mysql_conn.rollback()
        raise e
    finally:
        # Always re-enable foreign key checks
        try:
            mysql_cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
        except Exception:
            pass
        
        sqlite_conn.close()
        mysql_conn.close()
        print("Migration process finished.")

if __name__ == "__main__":
    migrate()
