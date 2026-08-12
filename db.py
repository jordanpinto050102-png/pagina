import hashlib
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path


DB_PATH = Path("mantto_web.db")


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt, digest.hex()


def verify_password(password, salt, password_hash):
    _, digest = hash_password(password, salt)
    return secrets.compare_digest(digest, password_hash)


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                full_name TEXT,
                apellidos TEXT,
                dni_codigo TEXT,
                area TEXT,
                cargo TEXT,
                role TEXT NOT NULL DEFAULT 'tecnico',
                salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS equipos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                rubro TEXT,
                sede TEXT,
                referencia TEXT,
                ubicacion TEXT,
                proceso TEXT,
                sistema TEXT,
                equipo TEXT,
                sub_equipo TEXT,
                componente TEXT,
                tipo_equipo TEXT,
                estado TEXT DEFAULT 'activo'
            );

            CREATE TABLE IF NOT EXISTS personal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                sede TEXT,
                nombre TEXT,
                cargo TEXT,
                area TEXT,
                estado TEXT DEFAULT 'activo'
            );

            CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                nombre TEXT,
                unidad TEXT,
                stock REAL DEFAULT 0,
                estado TEXT DEFAULT 'activo'
            );

            CREATE TABLE IF NOT EXISTS repuestos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo TEXT UNIQUE,
                nombre TEXT,
                unidad TEXT,
                stock REAL DEFAULT 0,
                estado TEXT DEFAULT 'activo'
            );

            CREATE TABLE IF NOT EXISTS avisos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE,
                usuario TEXT,
                rubro TEXT,
                sede TEXT,
                referencia TEXT,
                ubicacion TEXT,
                proceso TEXT,
                sistema TEXT,
                equipo TEXT,
                sub_equipo TEXT,
                tipo_equipo TEXT,
                equipo_codigo TEXT,
                creado TEXT,
                descripcion TEXT,
                prioridad TEXT,
                tipo_falla TEXT,
                tipo_aviso TEXT,
                estado TEXT DEFAULT 'ABIERTO',
                ot_generada TEXT,
                creado_en TEXT
            );

            CREATE TABLE IF NOT EXISTS ots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE,
                usuario TEXT,
                origen TEXT,
                aviso_numero TEXT,
                tipo_servicio TEXT,
                modo_equipo TEXT,
                equipo_codigo TEXT,
                sede TEXT,
                referencia TEXT,
                ubicacion TEXT,
                proceso TEXT,
                sistema TEXT,
                equipo TEXT,
                sub_equipo TEXT,
                componente TEXT,
                tipo_equipo TEXT,
                tipo_falla TEXT,
                tipo_intervencion TEXT,
                parada_linea TEXT,
                descripcion_trabajo TEXT,
                tecnico_1 TEXT,
                tecnico_2 TEXT,
                hora_inicio TEXT,
                hora_fin TEXT,
                fecha_intervencion TEXT,
                fecha_atencion TEXT,
                trabajo_realizado TEXT,
                observaciones TEXT,
                estado TEXT DEFAULT 'CREADA',
                creado_en TEXT
            );

            CREATE TABLE IF NOT EXISTS ot_eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ot_numero TEXT NOT NULL,
                evento TEXT NOT NULL,
                estado TEXT,
                usuario TEXT,
                tecnico TEXT,
                detalle TEXT,
                creado_en TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ot_calificaciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ot_numero TEXT UNIQUE NOT NULL,
                fecha TEXT NOT NULL,
                usuario TEXT,
                tecnico TEXT,
                calificacion INTEGER NOT NULL,
                comentario TEXT,
                calidad INTEGER DEFAULT 0,
                limpieza INTEGER DEFAULT 0,
                tiempo INTEGER DEFAULT 0,
                orden INTEGER DEFAULT 0,
                seguridad INTEGER DEFAULT 0,
                cumplimiento INTEGER DEFAULT 0,
                solucion INTEGER DEFAULT 0,
                atencion INTEGER DEFAULT 0,
                promedio REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT,
                accion TEXT NOT NULL,
                entidad TEXT,
                registro TEXT,
                valor_anterior TEXT,
                valor_nuevo TEXT,
                creado_en TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS peticiones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT UNIQUE,
                usuario TEXT,
                ot_numero TEXT,
                item_codigo TEXT,
                item_nombre TEXT,
                cantidad REAL,
                unidad TEXT,
                motivo TEXT,
                estado TEXT DEFAULT 'pendiente',
                atendido_por TEXT,
                atendido_en TEXT,
                creado_en TEXT
            );
            """
        )
        ensure_columns(
            conn,
            "users",
            {
                "apellidos": "TEXT",
                "dni_codigo": "TEXT",
                "area": "TEXT",
                "cargo": "TEXT",
            },
        )
        ensure_columns(
            conn,
            "equipos",
            {
                "rubro": "TEXT",
                "sede": "TEXT",
                "referencia": "TEXT",
                "sub_equipo": "TEXT",
                "tipo_equipo": "TEXT",
            },
        )
        ensure_columns(
            conn,
            "personal",
            {
                "sede": "TEXT",
                "area": "TEXT",
                "cargo": "TEXT",
            },
        )
        ensure_columns(
            conn,
            "ot_calificaciones",
            {
                "calidad": "INTEGER DEFAULT 0",
                "limpieza": "INTEGER DEFAULT 0",
                "tiempo": "INTEGER DEFAULT 0",
                "orden": "INTEGER DEFAULT 0",
                "seguridad": "INTEGER DEFAULT 0",
                "cumplimiento": "INTEGER DEFAULT 0",
                "solucion": "INTEGER DEFAULT 0",
                "atencion": "INTEGER DEFAULT 0",
                "promedio": "REAL DEFAULT 0",
            },
        )
        ensure_columns(
            conn,
            "ots",
            {
                "sede": "TEXT",
                "referencia": "TEXT",
                "sub_equipo": "TEXT",
                "tipo_equipo": "TEXT",
                "fecha_atencion": "TEXT",
                "cerrado_en": "TEXT",
                "usuario_cierre": "TEXT",
                "trabajo_realizado": "TEXT",
                "observaciones": "TEXT",
            },
        )
        ensure_columns(
            conn,
            "avisos",
            {
                "rubro": "TEXT",
                "sede": "TEXT",
                "referencia": "TEXT",
                "ubicacion": "TEXT",
                "proceso": "TEXT",
                "sistema": "TEXT",
                "equipo": "TEXT",
                "sub_equipo": "TEXT",
                "tipo_equipo": "TEXT",
                "creado": "TEXT",
                "tipo_falla": "TEXT",
                "tipo_aviso": "TEXT",
            },
        )
        admin = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
        if not admin:
            salt, password_hash = hash_password("admin123")
            conn.execute(
                """
                INSERT INTO users (username, full_name, role, salt, password_hash, active, created_at)
                VALUES ('admin', 'Administrador', 'admin', ?, ?, 1, ?)
                """,
                (salt, password_hash, now_iso()),
            )
        conn.execute("UPDATE avisos SET estado = 'ABIERTO' WHERE estado IS NULL OR trim(estado) = '' OR lower(estado) = 'pendiente'")
        conn.execute("UPDATE avisos SET estado = 'CERRADO' WHERE upper(estado) = 'CONVERTIDO EN OT'")


def ensure_columns(conn, table, columns):
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, column_type in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {column_type}")


def rows(table):
    with connect() as conn:
        return [dict(r) for r in conn.execute(f"SELECT * FROM {table} ORDER BY id DESC")]


def row_by_id(table, record_id):
    with connect() as conn:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
        return dict(row) if row else None


def next_number(conn, table, prefix):
    year = datetime.now().year
    like = f"{prefix}-{year}-%"
    row = conn.execute(
        f"SELECT numero FROM {table} WHERE numero LIKE ? ORDER BY id DESC LIMIT 1",
        (like,),
    ).fetchone()
    if not row:
        return f"{prefix}-{year}-0001"
    last = int(row["numero"].split("-")[-1])
    return f"{prefix}-{year}-{last + 1:04d}"


def create_session(conn, username):
    token = secrets.token_urlsafe(32)
    created_at = now_iso()
    expires_at = (datetime.now() + timedelta(hours=12)).replace(microsecond=0).isoformat()
    conn.execute(
        "INSERT INTO sessions (token, username, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (token, username, expires_at, created_at),
    )
    return token, expires_at


def get_user_by_token(token):
    if not token:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.full_name, u.role, u.active,
                   COALESCE(NULLIF(u.cargo, ''), (
                       SELECT p.cargo
                       FROM personal p
                       WHERE lower(p.nombre) = lower(COALESCE(u.full_name, u.username))
                          OR lower(p.nombre) = lower(u.username)
                       LIMIT 1
                   )) AS cargo
            FROM sessions s
            JOIN users u ON u.username = s.username
            WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
            """,
            (token, now_iso()),
        ).fetchone()
        return dict(row) if row else None


def upsert_many(table, records, unique_key="codigo"):
    if not records:
        return 0
    with connect() as conn:
        allowed_columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        count = 0
        for record in records:
            clean = {
                normalize_column_name(k): normalize_value(v)
                for k, v in record.items()
                if normalize_column_name(k) in allowed_columns
            }
            if table == "personal" and not clean.get("codigo") and clean.get("nombre"):
                clean["codigo"] = clean["nombre"]
            if not clean.get(unique_key):
                continue
            keys = list(clean.keys())
            assignments = ", ".join([f"{k}=excluded.{k}" for k in keys if k != unique_key])
            placeholders = ", ".join(["?"] * len(keys))
            conn.execute(
                f"""
                INSERT INTO {table} ({', '.join(keys)})
                VALUES ({placeholders})
                ON CONFLICT({unique_key}) DO UPDATE SET {assignments}
                """,
                [clean[k] for k in keys],
            )
            count += 1
        return count


def normalize_value(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def normalize_column_name(value):
    return (
        str(value)
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )
