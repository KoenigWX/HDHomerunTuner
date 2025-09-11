import sqlite3
import json
from pathlib import Path

DB_PATH = Path('scan_results.db')

def _connect():
    return sqlite3.connect(DB_PATH)

def init_db():
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scan_results (
                timestamp INT,
                tuner INT,
                channel INT,
                ss INT,
                snq INT,
                seq INT,
                subchannels TEXT
            )
            """
        )
        conn.commit()

def insert_result(timestamp: int, tuner: int, channel: int, ss: int, snq: int, seq: int, subchannels: list):
    with _connect() as conn:
        conn.execute(
            "INSERT INTO scan_results (timestamp, tuner, channel, ss, snq, seq, subchannels) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (timestamp, tuner, channel, ss, snq, seq, json.dumps(subchannels)),
        )
        conn.commit()

def fetch_results(
    limit: int = 100,
    start_time: int | None = None,
    end_time: int | None = None,
    offset: int = 0,
):
    query = (
        "SELECT timestamp, tuner, channel, ss, snq, seq, subchannels FROM scan_results WHERE 1=1"
    )
    params: list = []
    if start_time is not None:
        query += " AND timestamp >= ?"
        params.append(start_time)
    if end_time is not None:
        query += " AND timestamp <= ?"
        params.append(end_time)
    query += " ORDER BY timestamp DESC"
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    if offset:
        query += " OFFSET ?"
        params.append(offset)
    with _connect() as conn:
        cur = conn.execute(query, params)
        rows = cur.fetchall()
    results = []
    for ts, tuner, channel, ss, snq, seq, subs in rows:
        try:
            subchannels = json.loads(subs) if subs else []
        except json.JSONDecodeError:
            subchannels = []
        results.append(
            {
                'timestamp': ts,
                'tuner': tuner,
                'channel': channel,
                'ss': ss,
                'snq': snq,
                'seq': seq,
                'subchannels': subchannels,
            }
        )
    return results
