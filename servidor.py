from io import BytesIO
from contextlib import contextmanager
from pathlib import Path
from typing import List, Optional
from zipfile import ZIP_DEFLATED, ZipFile
import json
import re
import unicodedata
import uuid

import pandas as pd
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from db import (
    connect as raw_connect,
    create_session,
    get_user_by_token,
    hash_password,
    init_db,
    next_number,
    now_iso,
    rows,
    upsert_many,
    verify_password,
)

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"

app = FastAPI(title="Mantto Web Propio - Alimentos Cielo SAC")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def norm_text(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[_\-.]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


@contextmanager
def connect():
    with raw_connect() as conn:
        conn.create_function("norm_text", 1, norm_text)
        yield conn


class LoginIn(BaseModel):
    username: str
    password: str


class UserIn(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = ""
    apellidos: Optional[str] = ""
    dni_codigo: Optional[str] = ""
    sede: Optional[str] = ""
    area: Optional[str] = ""
    cargo: Optional[str] = ""
    role: str = "tecnico"
    active: bool = True


class UserUpdateIn(BaseModel):
    password: Optional[str] = None
    full_name: Optional[str] = None
    apellidos: Optional[str] = None
    dni_codigo: Optional[str] = None
    sede: Optional[str] = None
    area: Optional[str] = None
    cargo: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class AvisoIn(BaseModel):
    rubro: Optional[str] = ""
    sede: Optional[str] = ""
    ubicacion: Optional[str] = ""
    proceso: Optional[str] = ""
    sistema: Optional[str] = ""
    equipo: Optional[str] = ""
    sub_equipo: Optional[str] = ""
    componente: Optional[str] = ""
    tipo_equipo: Optional[str] = ""
    equipo_codigo: Optional[str] = ""
    creado: Optional[str] = ""
    descripcion: str
    prioridad: Optional[str] = "media"
    tipo_falla: Optional[str] = ""
    tipo_aviso: Optional[str] = ""
    tipo_servicio: Optional[str] = "interno"
    referencia: Optional[str] = ""


class OTIn(BaseModel):
    origen: Optional[str] = "manual"
    aviso_numero: Optional[str] = ""
    tipo_servicio: str
    modo_equipo: str
    equipo_codigo: Optional[str] = ""
    sede: Optional[str] = ""
    ubicacion: Optional[str] = ""
    proceso: Optional[str] = ""
    sistema: Optional[str] = ""
    equipo: Optional[str] = ""
    sub_equipo: Optional[str] = ""
    componente: Optional[str] = ""
    tipo_equipo: Optional[str] = ""
    tipo_falla: str
    tipo_intervencion: str
    parada_linea: str
    descripcion_trabajo: str
    tecnico_1: str
    tecnico_2: Optional[str] = ""
    hora_inicio: str
    hora_fin: str
    fecha_intervencion: str
    observaciones: Optional[str] = ""
    referencia: Optional[str] = ""


class OTAtenderIn(BaseModel):
    fecha_atencion: str
    tecnico: str
    trabajo_realizado: str
    observaciones: Optional[str] = ""
    estado_final: str = "ATENDIDA"


class CalificacionIn(BaseModel):
    calidad: int
    limpieza: int
    tiempo: int
    orden: int
    seguridad: int = 0
    cumplimiento: int = 0
    solucion: int = 0
    atencion: int = 0
    comentario: Optional[str] = ""


class PeticionIn(BaseModel):
    ot_numero: Optional[str] = ""
    item_codigo: str
    item_nombre: str
    cantidad: float
    unidad: Optional[str] = ""
    motivo: Optional[str] = ""
    criticidad: Optional[str] = ""


class PersonalIn(BaseModel):
    sede: Optional[str] = ""
    area: Optional[str] = ""
    nombre: str
    cargo: Optional[str] = ""
    estado: Optional[str] = "activo"


class AvisoAtencionIn(BaseModel):
    tecnico: str
    fecha_atencion: str
    hora_inicio: str
    hora_fin: str
    sede: str
    ubicacion: str
    proceso: str
    sistema: str
    equipo: str
    equipo_codigo: Optional[str] = ""
    tipo_equipo: Optional[str] = ""
    sub_equipo: Optional[str] = ""
    componente: Optional[str] = ""
    tipo_falla: Optional[str] = ""
    tipo_intervencion: Optional[str] = ""
    descripcion_falla: str
    observacion: Optional[str] = ""
    trabajo_realizado: str
    estado: str = "ATENDIDO"


class StockLimitsIn(BaseModel):
    cantidad: Optional[float] = None
    stock_minimo: Optional[float] = 0
    stock_maximo: Optional[float] = 0


class CodigoBarrasIn(BaseModel):
    codigo_barras: Optional[str] = ""
    generar: Optional[bool] = False


class OTCerrarIn(BaseModel):
    fecha_atencion: Optional[str] = ""


class PeticionCartItemIn(BaseModel):
    tabla: Optional[str] = ""
    item_id: Optional[int] = None
    codigo: str
    descripcion: str
    unidad: Optional[str] = ""
    cantidad: float


class PeticionCartIn(BaseModel):
    ot_numero: Optional[str] = ""
    motivo: Optional[str] = ""
    criticidad: Optional[str] = ""
    items: List[PeticionCartItemIn]


class InventarioIngresoIn(BaseModel):
    tabla: str = "repuestos"
    codigo: str
    descripcion: str
    unidad: Optional[str] = ""
    sede: Optional[str] = ""
    tipo: Optional[str] = ""
    categoria: Optional[str] = ""
    area: Optional[str] = ""
    modelo: Optional[str] = ""
    ubicacion: Optional[str] = ""
    proveedor: Optional[str] = ""
    codigo_barras: Optional[str] = ""
    stock_minimo: Optional[float] = 0
    stock_maximo: Optional[float] = 0
    cantidad: float
    motivo: Optional[str] = "INGRESO DE ALMACEN"
    observacion: Optional[str] = ""


def table_exists(conn, table):
    row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return bool(row)


def distinct_sedes_conn(conn):
    if not table_exists(conn, "equipos"):
        return []
    columns = set(mtto_table_columns(conn, "equipos"))
    if "sede" not in columns:
        return []
    found = {}
    for row in conn.execute(
        """
        SELECT DISTINCT TRIM(COALESCE(sede, '')) AS sede
        FROM equipos
        WHERE sede IS NOT NULL AND TRIM(sede) <> ''
        ORDER BY sede
        """
    ).fetchall():
        raw = str(row["sede"] or "").strip()
        key = norm_text(raw)
        if key and key not in found:
            found[key] = raw.upper()
    return list(found.values())


def canonical_sede_conn(conn, value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    key = norm_text(raw)
    for sede in distinct_sedes_conn(conn):
        if norm_text(sede) == key:
            return sede
    return raw.upper()


def personal_profile_conn(conn, user):
    if not table_exists(conn, "personal"):
        return None
    columns = set(mtto_table_columns(conn, "personal"))
    if "sede" not in columns:
        return None
    candidates = [
        user.get("username"),
        user.get("full_name"),
        user.get("dni_codigo"),
        user.get("nombre"),
    ]
    predicates = []
    params = []
    if "nombre" in columns:
        for value in candidates[:2]:
            if value:
                predicates.append("norm_text(COALESCE(nombre, '')) = norm_text(?)")
                params.append(value)
    if "codigo" in columns and user.get("dni_codigo"):
        predicates.append("norm_text(COALESCE(codigo, '')) = norm_text(?)")
        params.append(user.get("dni_codigo"))
    if "clave" in columns:
        for value in candidates:
            if value:
                predicates.append("norm_text(COALESCE(clave, '')) = norm_text(?)")
                params.append(value)
    if not predicates:
        return None
    sql = f"SELECT * FROM personal WHERE {' OR '.join(predicates)} LIMIT 1"
    return conn.execute(sql, params).fetchone()


def full_user_record_conn(conn, user):
    base = dict(user or {})
    username = str(base.get("username") or "").strip()
    if not username or not table_exists(conn, "users"):
        return base
    row = conn.execute("SELECT * FROM users WHERE username = ? LIMIT 1", (username,)).fetchone()
    if not row:
        return base
    data = dict(row)
    for key, value in base.items():
        if key not in data or data.get(key) in (None, ""):
            data[key] = value
    return data


def enrich_user_context_conn(conn, user, x_sede_scope=""):
    data = full_user_record_conn(conn, user)
    profile = personal_profile_conn(conn, data)
    if profile:
        for key in ("sede", "area", "cargo"):
            if key in profile.keys() and not str(data.get(key) or "").strip():
                data[key] = profile[key]
        if "nombre" in profile.keys() and not str(data.get("full_name") or "").strip():
            data["full_name"] = profile["nombre"]
    data["role"] = normalize_role(data.get("role") or data.get("cargo") or "")
    data["sede"] = canonical_sede_conn(conn, data.get("sede") or "")
    selected = str(x_sede_scope or "").strip()
    if is_admin_user(data) and selected and norm_text(selected) not in {"todas", "todas las sedes", "all"}:
        allowed = canonical_sede_conn(conn, selected)
        if allowed and any(norm_text(allowed) == norm_text(s) for s in distinct_sedes_conn(conn)):
            data["_sede_scope"] = allowed
    return data


def current_user(authorization: Optional[str] = Header(default=None), x_sede_scope: Optional[str] = Header(default="")):
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Sesion no valida")
    with connect() as conn:
        return enrich_user_context_conn(conn, user, x_sede_scope)


def require_admin(user=Depends(current_user)):
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Solo administrador")
    return user


def is_admin_user(user):
    role = norm_text(normalize_role(user.get("role") or ""))
    return role in {"admin", "administrador"}


def user_sede(user):
    return canonical_sede(
        user.get("sede")
        or user.get("SEDE")
        or user.get("planta")
        or user.get("local")
        or user.get("centro")
        or user.get("sucursal")
        or ""
    )


def public_user_context(user):
    sede = user_sede(user)
    role = normalize_role(user.get("role") or "")
    if is_admin_user(user):
        role = "admin"
    return {
        "username": user.get("username") or "",
        "full_name": user.get("full_name") or user.get("username") or "",
        "role": role,
        "sede": sede,
        "sede_norm": norm_text(sede),
        "area": user.get("area") or "",
        "cargo": user.get("cargo") or "",
        "is_admin": role == "admin",
    }


def canonical_sede(value):
    return str(value or "").strip().upper()


def normalize_role(value):
    role = norm_text(value)
    role_map = {
        "administrador": "admin",
        "admin": "admin",
        "jefe de area": "jefe",
        "jefe area": "jefe",
        "jefe": "jefe",
        "supervisor": "supervisor",
        "mantenimiento": "tecnico",
        "tecnico": "tecnico",
        "solicitante": "tecnico",
        "almacen": "almacen",
        "almacenero": "almacen",
    }
    return role_map.get(role, role if role in {"admin", "supervisor", "jefe", "tecnico", "almacen"} else "tecnico")


def sede_scope_sql(user, alias="", inventory=False):
    if is_admin_user(user) and not user.get("_sede_scope"):
        return "", []
    sede = user.get("_sede_scope") if is_admin_user(user) else user_sede(user)
    if not sede:
        return " AND 1 = 0", []
    prefix = f"{alias}." if alias else ""
    column = "sede"
    return f" AND norm_text(COALESCE({prefix}{column}, '')) = norm_text(?)", [sede]


def sede_scope_sql_expr(user, expr):
    if is_admin_user(user) and not user.get("_sede_scope"):
        return "", []
    sede = user.get("_sede_scope") if is_admin_user(user) else user_sede(user)
    if not sede:
        return " AND 1 = 0", []
    return f" AND norm_text(COALESCE({expr}, '')) = norm_text(?)", [sede]


def effective_sede_scope(user):
    if is_admin_user(user):
        return user.get("_sede_scope") or ""
    return user_sede(user)


def assert_row_sede(row, user, label="Registro"):
    if is_admin_user(user):
        return
    sede = user_sede(user)
    if not sede:
        raise HTTPException(status_code=403, detail="Usuario sin sede asignada")
    row_sede = row["sede"] if row and "sede" in row.keys() else ""
    if norm_text(row_sede) != norm_text(sede):
        raise HTTPException(status_code=403, detail=f"{label} fuera de la sede del usuario")


def peticion_sede_scope_sql(user, user_alias="u", personal_alias="per"):
    if is_admin_user(user) and not user.get("_sede_scope"):
        return "", []
    sede = user.get("_sede_scope") if is_admin_user(user) else user_sede(user)
    if not sede:
        return " AND 1 = 0", []
    return f" AND norm_text(COALESCE(NULLIF(p.sede, ''), {user_alias}.sede, {personal_alias}.sede, '')) = norm_text(?)", [sede]


def movimiento_sede_scope_sql(user):
    if is_admin_user(user) and not user.get("_sede_scope"):
        return "", []
    sede = user.get("_sede_scope") if is_admin_user(user) else user_sede(user)
    if not sede:
        return " AND 1 = 0", []
    return " AND norm_text(COALESCE(NULLIF(m.sede, ''), p.sede, u.sede, per.sede, '')) = norm_text(?)", [sede]


def assert_peticion_scope(conn, numero, user):
    if is_admin_user(user):
        return
    sede = user_sede(user)
    if not sede:
        raise HTTPException(status_code=403, detail="Usuario sin sede asignada")
    allowed = conn.execute(
        """
        SELECT p.numero
        FROM peticiones p
        LEFT JOIN users u ON u.username = p.usuario
        LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, ''))
        WHERE p.numero = ?
          AND norm_text(COALESCE(NULLIF(p.sede, ''), u.sede, per.sede, '')) = norm_text(?)
        LIMIT 1
        """,
        (numero, sede),
    ).fetchone()
    if not allowed:
        raise HTTPException(status_code=403, detail="Peticion fuera de la sede del usuario")


def get_inventory_row_for_user(conn, tabla, record_id, user):
    validar_tabla(tabla, {"productos", "repuestos"})
    if str(record_id).isdigit():
        row = conn.execute(f"SELECT * FROM {tabla} WHERE id = ?", (int(record_id),)).fetchone()
    else:
        row = conn.execute(f"SELECT * FROM {tabla} WHERE codigo = ? LIMIT 1", (record_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Item de inventario no encontrado")
    assert_row_sede(row, user, "Item de inventario")
    return row


def inventory_barcode_exists(conn, codigo_barras, exclude_table="", exclude_id=0):
    code = str(codigo_barras or "").strip()
    if not code:
        return None
    for table in ("productos", "repuestos"):
        row = conn.execute(
            f"""
            SELECT id, codigo, descripcion, sede
            FROM {table}
            WHERE norm_text(COALESCE(codigo_barras, '')) = norm_text(?)
              AND NOT (? = ? AND id = ?)
            LIMIT 1
            """,
            (code, table, exclude_table, int(exclude_id or 0)),
        ).fetchone()
        if row:
            data = dict(row)
            data["tabla"] = table
            return data
    return None


def generate_inventory_barcode(conn):
    # 750 + 10 digitos mantiene compatibilidad visual con lectores EAN-like sin
    # cambiar el codigo interno del repuesto.
    for _ in range(200):
        candidate = f"750{int(uuid.uuid4().int % 10_000_000_000):010d}"
        if not inventory_barcode_exists(conn, candidate):
            return candidate
    raise HTTPException(status_code=500, detail="No se pudo generar un codigo unico")


def is_jefe_user(user):
    role = str(user.get("role") or "").lower()
    cargo = str(user.get("cargo") or "").lower()
    return role in {"admin", "supervisor", "jefe"} or cargo in {"jefe", "jefe de area", "supervisor"}


def require_jefe(user=Depends(current_user)):
    if not is_jefe_user(user):
        raise HTTPException(status_code=403, detail="Solo personal JEFE puede realizar esta accion")
    return user


def require_almacen_or_jefe(user=Depends(current_user)):
    role = str(user.get("role") or "").lower()
    cargo = str(user.get("cargo") or "").lower()
    if is_jefe_user(user) or role == "almacen" or cargo == "almacen":
        return user
    raise HTTPException(status_code=403, detail="Solo personal de almacen o JEFE puede realizar esta accion")


def is_tecnico_user(user):
    role = str(user.get("role") or "").lower()
    cargo = str(user.get("cargo") or "").lower()
    return role in {"admin", "supervisor", "tecnico"} or cargo == "tecnico"


def require_tecnico(user=Depends(current_user)):
    if not is_tecnico_user(user):
        raise HTTPException(status_code=403, detail="Solo personal TECNICO puede realizar esta accion")
    return user


def validar_tabla(tabla, permitidas):
    if tabla not in permitidas:
        raise HTTPException(status_code=400, detail="Tabla no permitida")


def validar_rol(role):
    if role not in {"admin", "supervisor", "jefe", "tecnico", "almacen"}:
        raise HTTPException(status_code=400, detail="Rol no permitido")


def normalizar_columna(columna):
    return (
        str(columna)
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


def mtto_norm(value):
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def mtto_float(value, default=0):
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    text = text.replace(",", ".")
    text = re.sub(r"[^0-9.\-]", "", text)
    try:
        return float(text)
    except ValueError:
        return default


def mtto_table_columns(conn, table):
    return [row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def mtto_ensure_column(conn, table, column, definition):
    if column not in set(mtto_table_columns(conn, table)):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def canonicalize_existing_sedes(conn):
    # La comparacion de sedes se normaliza en consultas; no se reescriben
    # datos historicos automaticamente para evitar cambiar valores importados.
    return


def registrar_evento(conn, ot_numero, evento, estado, usuario, tecnico="", detalle=""):
    conn.execute(
        """
        INSERT INTO ot_eventos (ot_numero, evento, estado, usuario, tecnico, detalle, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (ot_numero, evento, estado, usuario, tecnico, detalle, now_iso()),
    )


def registrar_historial(conn, usuario, accion, entidad, registro, valor_anterior="", valor_nuevo=""):
    conn.execute(
        """
        INSERT INTO historial (usuario, accion, entidad, registro, valor_anterior, valor_nuevo, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (usuario, accion, entidad, registro, valor_anterior or "", valor_nuevo or "", now_iso()),
    )


def init_mantto_extra_schema():
    with connect() as conn:
        for column, definition in [
            ("componente", "TEXT DEFAULT ''"),
            ("descripcion_falla", "TEXT DEFAULT ''"),
            ("trabajo_realizado", "TEXT DEFAULT ''"),
            ("observaciones", "TEXT DEFAULT ''"),
            ("ot_generada", "TEXT DEFAULT ''"),
            ("tipo_servicio", "TEXT DEFAULT ''"),
            ("tipo_intervencion", "TEXT DEFAULT ''"),
            ("imagenes", "TEXT DEFAULT '[]'"),
        ]:
            mtto_ensure_column(conn, "avisos", column, definition)

        for column, definition in [
            ("componente", "TEXT DEFAULT ''"),
            ("trabajo_realizado", "TEXT DEFAULT ''"),
            ("usuario_cierre", "TEXT DEFAULT ''"),
            ("cerrado_en", "TEXT DEFAULT ''"),
            ("fecha_atencion", "TEXT DEFAULT ''"),
            ("repuestos_utilizados", "TEXT DEFAULT ''"),
        ]:
            mtto_ensure_column(conn, "ots", column, definition)

        for table in ("productos", "repuestos"):
            for column, definition in [
                ("sede", "TEXT DEFAULT ''"),
                ("tipo", "TEXT DEFAULT ''"),
                ("categoria", "TEXT DEFAULT ''"),
                ("area", "TEXT DEFAULT ''"),
                ("descripcion", "TEXT DEFAULT ''"),
                ("modelo", "TEXT DEFAULT ''"),
                ("cantidad", "REAL DEFAULT 0"),
                ("ubicacion", "TEXT DEFAULT ''"),
                ("proveedor", "TEXT DEFAULT ''"),
                ("stock_minimo", "REAL DEFAULT 0"),
                ("stock_maximo", "REAL DEFAULT 0"),
                ("codigo_barras", "TEXT DEFAULT ''"),
            ]:
                mtto_ensure_column(conn, table, column, definition)

        mtto_ensure_column(conn, "peticiones", "criticidad", "TEXT DEFAULT ''")
        mtto_ensure_column(conn, "peticiones", "sede", "TEXT DEFAULT ''")

        for column, definition in [
            ("apellidos", "TEXT DEFAULT ''"),
            ("dni_codigo", "TEXT DEFAULT ''"),
            ("sede", "TEXT DEFAULT ''"),
            ("area", "TEXT DEFAULT ''"),
            ("cargo", "TEXT DEFAULT ''"),
        ]:
            mtto_ensure_column(conn, "users", column, definition)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS aviso_atenciones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                aviso_numero TEXT NOT NULL,
                tecnico TEXT NOT NULL,
                fecha_atencion TEXT NOT NULL,
                hora_inicio TEXT NOT NULL,
                hora_fin TEXT NOT NULL,
                sede TEXT DEFAULT '',
                ubicacion TEXT DEFAULT '',
                proceso TEXT DEFAULT '',
                sistema TEXT DEFAULT '',
                equipo TEXT DEFAULT '',
                equipo_codigo TEXT DEFAULT '',
                tipo_equipo TEXT DEFAULT '',
                sub_equipo TEXT DEFAULT '',
                componente TEXT DEFAULT '',
                tipo_falla TEXT DEFAULT '',
                tipo_intervencion TEXT DEFAULT '',
                descripcion_falla TEXT DEFAULT '',
                trabajo_realizado TEXT NOT NULL,
                observacion TEXT DEFAULT '',
                estado TEXT NOT NULL,
                usuario TEXT NOT NULL,
                creado_en TEXT NOT NULL
            )
            """
        )
        for column, definition in [
            ("tipo_equipo", "TEXT DEFAULT ''"),
            ("tipo_falla", "TEXT DEFAULT ''"),
            ("tipo_intervencion", "TEXT DEFAULT ''"),
        ]:
            mtto_ensure_column(conn, "aviso_atenciones", column, definition)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS peticiones_detalle (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                peticion_numero TEXT NOT NULL,
                tabla TEXT DEFAULT '',
                item_id INTEGER,
                item_codigo TEXT NOT NULL,
                item_nombre TEXT NOT NULL,
                cantidad REAL NOT NULL,
                unidad TEXT DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inventario_movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                peticion_numero TEXT NOT NULL,
                sede TEXT DEFAULT '',
                tabla TEXT DEFAULT '',
                item_id INTEGER,
                item_codigo TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                cantidad REAL NOT NULL,
                unidad TEXT DEFAULT '',
                usuario TEXT NOT NULL,
                tipo_movimiento TEXT NOT NULL,
                stock_anterior REAL NOT NULL,
                stock_posterior REAL NOT NULL,
                creado_en TEXT NOT NULL
            )
            """
        )
        mtto_ensure_column(conn, "inventario_movimientos", "sede", "TEXT DEFAULT ''")
        canonicalize_existing_sedes(conn)


init_mantto_extra_schema()


def validar_tecnico_conn(conn, nombre, user=None):
    nombre = str(nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Tecnico responsable obligatorio")
    sede_sql = ""
    params = [nombre]
    if user and not is_admin_user(user):
        sede = user_sede(user)
        if not sede:
            raise HTTPException(status_code=403, detail="Usuario sin sede asignada")
        sede_sql = " AND norm_text(COALESCE(NULLIF(u.sede, ''), per.sede, '')) = norm_text(?)"
        params.append(sede)
    tecnico = conn.execute(
        f"""
        SELECT u.id FROM users u
        LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, u.username, ''))
        WHERE u.active = 1
          AND lower(COALESCE(NULLIF(u.full_name, ''), u.username)) = lower(?)
          AND (lower(COALESCE(u.role, '')) = 'tecnico'
               OR lower(COALESCE(u.cargo, per.cargo, '')) = 'tecnico'
               OR lower(COALESCE(u.cargo, per.cargo, '')) LIKE '%mantenimiento%')
          {sede_sql}
        LIMIT 1
        """,
        params,
    ).fetchone()
    if not tecnico:
        raise HTTPException(status_code=400, detail="El tecnico debe existir activo en DB USUARIOS con ROL/CARGO = Tecnico")


def crear_ot_tx(conn, data: OTIn, user, origen: str, aviso_numero: str):
    username = user["username"]
    validar_tecnico_conn(conn, data.tecnico_1, user)
    sede_final = data.sede if is_admin_user(user) and data.sede else effective_sede_scope(user) or data.sede
    if not sede_final:
        raise HTTPException(status_code=400, detail="Usuario sin sede asignada")
    numero = next_number(conn, "ots", "OT")
    conn.execute(
        """
        INSERT INTO ots
        (numero, usuario, origen, aviso_numero, tipo_servicio, modo_equipo, equipo_codigo,
         sede, referencia, ubicacion, proceso, sistema, equipo, sub_equipo, componente, tipo_equipo,
         tipo_falla, tipo_intervencion, parada_linea, descripcion_trabajo, observaciones,
         tecnico_1, tecnico_2, hora_inicio, hora_fin, fecha_intervencion, estado, creado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTA', ?)
        """,
        (
            numero,
            username,
            origen,
            aviso_numero,
            data.tipo_servicio,
            data.modo_equipo,
            data.equipo_codigo,
            sede_final,
            data.ubicacion,
            data.proceso,
            data.sistema,
            data.equipo,
            data.sub_equipo,
            data.componente,
            data.tipo_equipo,
            data.tipo_falla,
            data.tipo_intervencion,
            data.parada_linea,
            data.descripcion_trabajo,
            data.observaciones,
            data.tecnico_1,
            data.tecnico_2,
            data.hora_inicio,
            data.hora_fin,
            data.fecha_intervencion,
            now_iso(),
        ),
    )
    registrar_evento(conn, numero, "CREACION", "ABIERTA", username, data.tecnico_1, data.descripcion_trabajo)
    registrar_historial(conn, username, "GENERO OT", "ots", numero, aviso_numero, data.descripcion_trabajo)
    return numero


def buscar_ots(desde="", hasta="", estado="", tecnico="", sede="", equipo="", numeros="", codigo="", prioridad="", tipo_mantenimiento="", user=None):
    sql = "SELECT * FROM ots WHERE 1 = 1"
    params = []
    if numeros:
        selected = [n.strip() for n in numeros.split(",") if n.strip()]
        if selected:
            sql += f" AND numero IN ({','.join(['?'] * len(selected))})"
            params.extend(selected)
    if desde:
        sql += " AND date(creado_en) >= date(?)"
        params.append(desde)
    if hasta:
        sql += " AND date(creado_en) <= date(?)"
        params.append(hasta)
    if estado:
        sql += " AND estado = ?"
        params.append(estado)
    if tecnico:
        sql += " AND (tecnico_1 LIKE ? OR tecnico_2 LIKE ?)"
        params.extend([f"%{tecnico}%", f"%{tecnico}%"])
    if user is not None and (not is_admin_user(user) or user.get("_sede_scope")):
        user_scope = effective_sede_scope(user)
        if not user_scope:
            sql += " AND 1 = 0"
        else:
            sql += " AND norm_text(COALESCE(sede, '')) = norm_text(?)"
            params.append(user_scope)
    elif sede:
        sql += " AND norm_text(COALESCE(sede, '')) = norm_text(?)"
        params.append(sede)
    if equipo:
        sql += " AND equipo LIKE ?"
        params.append(f"%{equipo}%")
    if codigo:
        sql += " AND equipo_codigo LIKE ?"
        params.append(f"%{codigo}%")
    if prioridad:
        sql += " AND tipo_falla LIKE ?"
        params.append(f"%{prioridad}%")
    if tipo_mantenimiento:
        sql += " AND (tipo_intervencion LIKE ? OR tipo_servicio LIKE ?)"
        params.extend([f"%{tipo_mantenimiento}%", f"%{tipo_mantenimiento}%"])
    sql += " ORDER BY id DESC"
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql, params)]


def dashboard_counts():
    with connect() as conn:
        active_ot_filter = "UPPER(COALESCE(estado, '')) NOT IN ('CANCELADA', 'CANCELADO', 'ELIMINADA', 'ELIMINADO')"
        total_ots = conn.execute(f"SELECT COUNT(*) AS c FROM ots WHERE {active_ot_filter}").fetchone()["c"]
        ots_abiertas = conn.execute("""
            SELECT COUNT(*) AS c FROM ots
            WHERE UPPER(COALESCE(estado, '')) IN ('ABIERTA', 'ASIGNADA', 'PENDIENTE', 'CREADA', 'EN EJECUCION', 'EN PROCESO')
        """).fetchone()["c"]
        ots_cerradas = conn.execute("""
            SELECT COUNT(*) AS c FROM ots
            WHERE UPPER(COALESCE(estado, '')) IN ('TERMINADA', 'CERRADA', 'CALIFICADA')
        """).fetchone()["c"]
        por_calificar = conn.execute("""
            SELECT COUNT(*) AS c
            FROM ots o
            LEFT JOIN ot_calificaciones c ON c.ot_numero = o.numero
            WHERE UPPER(COALESCE(o.estado, '')) IN ('TERMINADA', 'CERRADA') AND c.id IS NULL
        """).fetchone()["c"]
        avisos_pendientes = conn.execute("""
            SELECT COUNT(*) AS c FROM avisos
            WHERE UPPER(COALESCE(estado, '')) IN ('ABIERTO', 'ABIERTA', 'PENDIENTE', 'CREADO', 'CREADA')
        """).fetchone()["c"]
        items_pendientes = conn.execute("""
            SELECT COUNT(*) AS c FROM peticiones
            WHERE UPPER(COALESCE(estado, '')) NOT IN ('ATENDIDO', 'SALIDA REALIZADA', 'CANCELADA', 'RECHAZADA')
        """).fetchone()["c"]
        equipos = conn.execute("SELECT COUNT(*) AS c FROM equipos").fetchone()["c"]
        calificadas = conn.execute("SELECT COUNT(*) AS c FROM ot_calificaciones").fetchone()["c"]
        ultimas_ots = [dict(r) for r in conn.execute("""
            SELECT numero, equipo_codigo, equipo, ubicacion, tipo_falla, estado, creado_en
            FROM ots
            WHERE UPPER(COALESCE(estado, '')) NOT IN ('CANCELADA', 'CANCELADO', 'ELIMINADA', 'ELIMINADO')
            ORDER BY id DESC LIMIT 6
        """)]
        ultimos_avisos = [dict(r) for r in conn.execute("""
            SELECT numero, ubicacion, equipo, prioridad, tipo_falla, estado, creado_en
            FROM avisos
            WHERE UPPER(COALESCE(estado, '')) IN ('ABIERTO', 'ABIERTA', 'PENDIENTE', 'CREADO', 'CREADA')
            ORDER BY id DESC LIMIT 6
        """)]
        actividad = [dict(r) for r in conn.execute("""
            SELECT creado_en, accion, entidad, registro, valor_nuevo
            FROM historial ORDER BY id DESC LIMIT 8
        """)]
        stock_bajo = 0
        for table in ("productos", "repuestos"):
            stock_bajo += conn.execute(f"""
                SELECT COUNT(*) AS c FROM {table}
                WHERE COALESCE(stock_minimo, 0) > 0 AND COALESCE(cantidad, 0) <= COALESCE(stock_minimo, 0)
            """).fetchone()["c"]
        return {
            "total_ots": total_ots,
            "ots_abiertas": ots_abiertas,
            "ots_cerradas": ots_cerradas,
            "por_calificar": por_calificar,
            "calificadas": calificadas,
            "avisos_pendientes": avisos_pendientes,
            "items_pendientes": items_pendientes,
            "equipos": equipos,
            "stock_bajo": stock_bajo,
            "ultimas_ots": ultimas_ots,
            "ultimos_avisos": ultimos_avisos,
            "actividad": actividad,
            "por_estado": [],
            "por_area": [],
        }


INVENTORY_ALIASES = {
    "sede": ["sede", "planta", "local", "centro", "sucursal"],
    "codigo": ["codigo", "código", "cod", "cod_item", "codigo_item", "item", "sku"],
    "codigo_barras": ["codigo_barras", "código_barras", "codigobarras", "codigo barras", "barcode", "bar_code", "ean", "ean13"],
    "tipo": ["tipo", "clase"],
    "categoria": ["categoria", "categoría", "familia", "grupo", "subfamilia"],
    "area": ["area", "área", "sector"],
    "descripcion": ["descripcion", "descripción", "nombre", "item_nombre", "producto", "repuesto", "material", "detalle"],
    "modelo": ["modelo", "referencia", "marca_modelo"],
    "cantidad": ["cantidad", "stock", "existencia", "saldo", "stock_actual", "cant"],
    "ubicacion": ["ubicacion", "ubicación", "almacen", "almacén", "rack", "ubicacion_almacen"],
    "proveedor": ["proveedor", "proovedor", "supplier"],
    "unidad": ["unidad", "und", "um", "u_m", "medida"],
    "stock_minimo": ["stock_minimo", "minimo", "mínimo", "stock_min", "min"],
    "stock_maximo": ["stock_maximo", "maximo", "máximo", "stock_max", "max"],
}


def mtto_pick(record, key):
    norm_map = {mtto_norm(k): v for k, v in record.items()}
    for alias in INVENTORY_ALIASES.get(key, [key]):
        value = norm_map.get(mtto_norm(alias))
        if value is not None and str(value).strip() != "":
            return value
    return ""


def importar_inventario_tx(tabla, registros):
    stats = {"importados": 0, "nuevos": 0, "actualizados": 0, "duplicados": 0, "errores": 0, "detalles": []}
    with connect() as conn:
        for index, record in enumerate(registros, start=2):
            codigo = str(mtto_pick(record, "codigo")).strip()
            descripcion = str(mtto_pick(record, "descripcion")).strip()
            if not codigo and not descripcion:
                continue
            if not codigo:
                stats["errores"] += 1
                stats["detalles"].append(f"Fila {index}: codigo vacio")
                continue
            data = {
                "codigo": codigo,
                "sede": canonical_sede(str(mtto_pick(record, "sede")).strip()),
                "codigo_barras": str(mtto_pick(record, "codigo_barras")).strip(),
                "tipo": str(mtto_pick(record, "tipo")).strip(),
                "categoria": str(mtto_pick(record, "categoria")).strip(),
                "area": str(mtto_pick(record, "area")).strip(),
                "descripcion": descripcion,
                "modelo": str(mtto_pick(record, "modelo")).strip(),
                "cantidad": mtto_float(mtto_pick(record, "cantidad"), 0),
                "ubicacion": str(mtto_pick(record, "ubicacion")).strip(),
                "proveedor": str(mtto_pick(record, "proveedor")).strip(),
                "unidad": str(mtto_pick(record, "unidad")).strip(),
                "stock_minimo": mtto_float(mtto_pick(record, "stock_minimo"), 0),
                "stock_maximo": mtto_float(mtto_pick(record, "stock_maximo"), 0),
            }
            exists = conn.execute(
                f"SELECT id FROM {tabla} WHERE codigo = ? AND norm_text(COALESCE(sede, '')) = norm_text(?)",
                (codigo, data["sede"]),
            ).fetchone()
            if exists:
                if data["codigo_barras"] and inventory_barcode_exists(conn, data["codigo_barras"], tabla, exists["id"]):
                    stats["errores"] += 1
                    stats["detalles"].append(f"Fila {index}: codigo de barras duplicado")
                    continue
                conn.execute(
                    f"""
                    UPDATE {tabla}
                    SET sede=?, codigo_barras=COALESCE(NULLIF(?, ''), codigo_barras),
                        tipo=?, categoria=?, area=?, descripcion=?, modelo=?, cantidad=?, ubicacion=?, proveedor=?, unidad=?,
                        stock_minimo=CASE WHEN ? > 0 THEN ? ELSE stock_minimo END,
                        stock_maximo=CASE WHEN ? > 0 THEN ? ELSE stock_maximo END
                    WHERE id=?
                    """,
                    (
                        data["sede"], data["codigo_barras"], data["tipo"], data["categoria"], data["area"], data["descripcion"], data["modelo"],
                        data["cantidad"], data["ubicacion"], data["proveedor"], data["unidad"],
                        data["stock_minimo"], data["stock_minimo"], data["stock_maximo"], data["stock_maximo"], exists["id"],
                    ),
                )
                stats["actualizados"] += 1
            else:
                if data["codigo_barras"] and inventory_barcode_exists(conn, data["codigo_barras"]):
                    stats["errores"] += 1
                    stats["detalles"].append(f"Fila {index}: codigo de barras duplicado")
                    continue
                conn.execute(
                    f"""
                    INSERT INTO {tabla}
                    (codigo, sede, codigo_barras, tipo, categoria, area, descripcion, modelo, cantidad, ubicacion, proveedor, unidad, stock_minimo, stock_maximo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data["codigo"], data["sede"], data["codigo_barras"], data["tipo"], data["categoria"], data["area"], data["descripcion"], data["modelo"],
                        data["cantidad"], data["ubicacion"], data["proveedor"], data["unidad"], data["stock_minimo"], data["stock_maximo"],
                    ),
                )
                stats["nuevos"] += 1
            stats["importados"] += 1
        stats["duplicados"] = stats["actualizados"]
    return stats


def importar_usuarios_tx(registros, username_admin):
    stats = {"importados": 0, "nuevos": 0, "actualizados": 0, "duplicados": 0, "errores": 0}
    with connect() as conn:
        for record in registros:
            clean = {normalizar_columna(k): v for k, v in record.items()}
            full_name = str(clean.get("nombre") or clean.get("full_name") or clean.get("usuario") or clean.get("username") or "").strip()
            username = str(clean.get("usuario") or clean.get("username") or clean.get("dni_codigo") or clean.get("codigo") or "").strip()
            if not username and full_name:
                username = mtto_norm(full_name).replace("_", ".")
            if not username:
                stats["errores"] += 1
                continue
            if not full_name:
                full_name = username
            apellidos = str(clean.get("apellidos") or "").strip()
            dni_codigo = str(clean.get("dni_codigo") or clean.get("dni") or clean.get("codigo") or "").strip()
            sede = canonical_sede(str(clean.get("sede") or clean.get("planta") or clean.get("local") or "").strip())
            area = str(clean.get("area") or "").strip()
            cargo = str(clean.get("cargo") or "").strip()
            role = str(clean.get("rol") or clean.get("role") or "tecnico").strip().lower()
            if cargo and str(clean.get("rol") or clean.get("role") or "").strip() == "":
                role = cargo.strip().lower()
            role = normalize_role(role)
            active_text = str(clean.get("estado") or "activo").strip().lower()
            active = 0 if active_text in {"0", "inactivo", "no", "false"} else 1
            exists = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if exists:
                conn.execute(
                    """
                    UPDATE users
                    SET full_name=?, apellidos=?, dni_codigo=?, sede=?, area=?, cargo=?, role=?, active=?
                    WHERE username=?
                    """,
                    (full_name, apellidos, dni_codigo, sede, area, cargo, role, active, username),
                )
                stats["actualizados"] += 1
            else:
                password = str(clean.get("clave") or clean.get("password") or dni_codigo or "123456")
                salt, password_hash = hash_password(password)
                conn.execute(
                    """
                    INSERT INTO users
                    (username, full_name, apellidos, dni_codigo, sede, area, cargo, role, salt, password_hash, active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (username, full_name, apellidos, dni_codigo, sede, area, cargo, role, salt, password_hash, active, now_iso()),
                )
                stats["nuevos"] += 1
            stats["importados"] += 1
        registrar_historial(conn, username_admin, "IMPORTO USUARIOS", "users", "excel", "", str(stats))
    stats["duplicados"] = stats["actualizados"]
    return stats


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/salud")
def salud():
    return {"ok": True, "app": "Mantto", "empresa": "Alimentos Cielo SAC"}


@app.get("/api/dashboard-publico")
def dashboard_publico():
    return dashboard_counts()


@app.get("/api/dashboard")
def dashboard(user=Depends(current_user)):
    if is_admin_user(user) and not user.get("_sede_scope"):
        return dashboard_counts()
    sede = effective_sede_scope(user)
    with connect() as conn:
        params = [sede]
        active_ot_filter = "UPPER(COALESCE(estado, '')) NOT IN ('CANCELADA', 'CANCELADO', 'ELIMINADA', 'ELIMINADO')"
        total_ots = conn.execute(f"SELECT COUNT(*) AS c FROM ots WHERE {active_ot_filter} AND norm_text(COALESCE(sede, '')) = norm_text(?)", params).fetchone()["c"]
        ots_abiertas = conn.execute("""
            SELECT COUNT(*) AS c FROM ots
            WHERE UPPER(COALESCE(estado, '')) IN ('ABIERTA', 'ASIGNADA', 'PENDIENTE', 'CREADA', 'EN EJECUCION', 'EN PROCESO')
              AND norm_text(COALESCE(sede, '')) = norm_text(?)
        """, params).fetchone()["c"]
        ots_cerradas = conn.execute("""
            SELECT COUNT(*) AS c FROM ots
            WHERE UPPER(COALESCE(estado, '')) IN ('TERMINADA', 'CERRADA', 'CALIFICADA')
              AND norm_text(COALESCE(sede, '')) = norm_text(?)
        """, params).fetchone()["c"]
        por_calificar = conn.execute("""
            SELECT COUNT(*) AS c
            FROM ots o
            LEFT JOIN ot_calificaciones c ON c.ot_numero = o.numero
            WHERE UPPER(COALESCE(o.estado, '')) IN ('TERMINADA', 'CERRADA') AND c.id IS NULL
              AND norm_text(COALESCE(o.sede, '')) = norm_text(?)
        """, params).fetchone()["c"]
        avisos_pendientes = conn.execute("""
            SELECT COUNT(*) AS c FROM avisos
            WHERE UPPER(COALESCE(estado, '')) IN ('ABIERTO', 'ABIERTA', 'PENDIENTE', 'CREADO', 'CREADA')
              AND norm_text(COALESCE(sede, '')) = norm_text(?)
        """, params).fetchone()["c"]
        equipos = conn.execute("SELECT COUNT(*) AS c FROM equipos WHERE norm_text(COALESCE(sede, '')) = norm_text(?)", params).fetchone()["c"]
        stock_bajo = 0
        for table in ("productos", "repuestos"):
            stock_bajo += conn.execute(f"""
                SELECT COUNT(*) AS c FROM {table}
                WHERE COALESCE(stock_minimo, 0) > 0 AND COALESCE(cantidad, 0) <= COALESCE(stock_minimo, 0)
                  AND norm_text(COALESCE(sede, '')) = norm_text(?)
            """, params).fetchone()["c"]
        return {
            "total_ots": total_ots,
            "ots_abiertas": ots_abiertas,
            "ots_cerradas": ots_cerradas,
            "por_calificar": por_calificar,
            "calificadas": 0,
            "avisos_pendientes": avisos_pendientes,
            "items_pendientes": 0,
            "equipos": equipos,
            "stock_bajo": stock_bajo,
            "ultimas_ots": [],
            "ultimos_avisos": [],
            "actividad": [],
            "por_estado": [],
            "por_area": [],
        }


@app.post("/api/login")
def login(data: LoginIn):
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (data.username.strip(),)).fetchone()
        if not row or not row["active"]:
            raise HTTPException(status_code=401, detail="Usuario o clave incorrectos")
        if not verify_password(data.password, row["salt"], row["password_hash"]):
            raise HTTPException(status_code=401, detail="Usuario o clave incorrectos")
        token, expires_at = create_session(conn, row["username"])
        enriched = enrich_user_context_conn(conn, dict(row))
        return {
            "token": token,
            "expires_at": expires_at,
            "user": public_user_context(enriched),
        }


@app.get("/api/me")
def me(user=Depends(current_user)):
    return public_user_context(user)


@app.get("/api/sedes")
def listar_sedes(user=Depends(current_user)):
    with connect() as conn:
        sedes = distinct_sedes_conn(conn)
    current = effective_sede_scope(user) or user_sede(user)
    if not is_admin_user(user):
        sedes = [current] if current else []
    return {"sedes": sedes, "current": current, "is_admin": is_admin_user(user)}


@app.get("/api/catalogos/{tabla}")
def catalogo(tabla: str, user=Depends(current_user)):
    validar_tabla(tabla, {"equipos", "personal", "productos", "repuestos"})
    if tabla == "personal":
        sql = """
            SELECT u.id, username, COALESCE(NULLIF(full_name, ''), username) AS nombre,
                   full_name, dni_codigo AS codigo,
                   COALESCE(NULLIF(u.sede, ''), per.sede, '') AS sede,
                   COALESCE(NULLIF(u.area, ''), per.area, '') AS area,
                   COALESCE(NULLIF(u.cargo, ''), per.cargo, '') AS cargo,
                   role, active
            FROM users u
            LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, u.username, ''))
            WHERE u.active = 1
        """
        params = []
        extra, extra_params = sede_scope_sql_expr(user, "NULLIF(u.sede, ''), per.sede")
        sql += extra + " ORDER BY full_name, username"
        params.extend(extra_params)
        with connect() as conn:
            return [dict(r) for r in conn.execute(sql, params)]
    sql = f"SELECT * FROM {tabla} WHERE 1 = 1"
    params = []
    scope_sql, scope_params = sede_scope_sql(user, inventory=tabla in {"productos", "repuestos"})
    sql += scope_sql
    params.extend(scope_params)
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql, params)]


@app.post("/api/catalogos/personal")
def crear_personal(data: PersonalIn, user=Depends(require_admin)):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Nombre de personal obligatorio")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO personal (codigo, sede, area, nombre, cargo, estado)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (nombre, data.sede, data.area, nombre, data.cargo, data.estado or "activo"),
        )
        return {"ok": True}


@app.patch("/api/catalogos/personal/{record_id}")
def actualizar_personal(record_id: int, data: PersonalIn, user=Depends(require_admin)):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Nombre de personal obligatorio")
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE personal SET codigo=?, sede=?, area=?, nombre=?, cargo=?, estado=? WHERE id=?
            """,
            (nombre, data.sede, data.area, nombre, data.cargo, data.estado or "activo", record_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Personal no encontrado")
        return {"ok": True}


@app.delete("/api/catalogos/personal/{record_id}")
def eliminar_personal(record_id: int, user=Depends(require_admin)):
    with connect() as conn:
        cur = conn.execute("DELETE FROM personal WHERE id = ?", (record_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Personal no encontrado")
        return {"ok": True}


@app.post("/api/importar/{tabla}")
async def importar_excel(tabla: str, archivo: UploadFile = File(...), user=Depends(require_admin)):
    validar_tabla(tabla, {"equipos", "personal", "productos", "repuestos", "usuarios"})
    suffix = Path(archivo.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Sube un archivo Excel .xlsx o .xls")
    content = await archivo.read()
    temp = ROOT / f"_import_tmp{suffix}"
    temp.write_bytes(content)
    try:
        df = pd.read_excel(temp).fillna("")
        registros = df.to_dict(orient="records")
        if tabla == "usuarios":
            return importar_usuarios_tx(registros, user["username"])
        if tabla in {"productos", "repuestos"}:
            return importar_inventario_tx(tabla, registros)
        df.columns = [normalizar_columna(c) for c in df.columns]
        return {"importados": upsert_many(tabla, df.to_dict(orient="records")), "nuevos": 0, "actualizados": 0, "duplicados": 0, "errores": 0}
    finally:
        temp.unlink(missing_ok=True)


def aviso_imagenes_from_row(row):
    raw = ""
    try:
        raw = row["imagenes"]
    except Exception:
        raw = ""
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except Exception:
        return []


def aviso_public_dict(row):
    data = dict(row)
    data["imagenes"] = aviso_imagenes_from_row(row)
    return data


def safe_upload_name(filename):
    suffix = Path(filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        suffix = ".jpg"
    return f"{uuid.uuid4().hex}{suffix}"


async def guardar_imagenes_aviso(numero, archivos):
    saved = []
    if not archivos:
        return saved
    target_dir = STATIC / "uploads" / "avisos" / numero
    target_dir.mkdir(parents=True, exist_ok=True)
    for archivo in archivos:
        if not archivo or not archivo.filename:
            continue
        content_type = str(archivo.content_type or "").lower()
        if content_type and not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Solo se permiten imagenes en el aviso")
        content = await archivo.read()
        if not content:
            continue
        if len(content) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Imagen demasiado grande: {archivo.filename}")
        filename = safe_upload_name(archivo.filename)
        path = target_dir / filename
        path.write_bytes(content)
        saved.append({
            "nombre": archivo.filename,
            "url": f"/static/uploads/avisos/{numero}/{filename}",
            "content_type": archivo.content_type or "",
        })
    return saved


@app.get("/api/avisos")
def listar_avisos(user=Depends(current_user)):
    with connect() as conn:
        sql = "SELECT * FROM avisos WHERE 1 = 1"
        params = []
        extra, extra_params = sede_scope_sql(user)
        sql += extra + " ORDER BY id DESC"
        params.extend(extra_params)
        return [aviso_public_dict(r) for r in conn.execute(sql, params)]


@app.post("/api/avisos")
async def crear_aviso(
    rubro: Optional[str] = Form(""),
    sede: Optional[str] = Form(""),
    ubicacion: Optional[str] = Form(""),
    proceso: Optional[str] = Form(""),
    sistema: Optional[str] = Form(""),
    equipo: Optional[str] = Form(""),
    sub_equipo: Optional[str] = Form(""),
    componente: Optional[str] = Form(""),
    tipo_equipo: Optional[str] = Form(""),
    equipo_codigo: Optional[str] = Form(""),
    creado: Optional[str] = Form(""),
    descripcion: str = Form(...),
    prioridad: Optional[str] = Form("media"),
    tipo_falla: Optional[str] = Form(""),
    tipo_aviso: Optional[str] = Form(""),
    tipo_servicio: Optional[str] = Form("interno"),
    imagenes: Optional[List[UploadFile]] = File(None),
    user=Depends(require_jefe),
):
    with connect() as conn:
        sede_final = sede if is_admin_user(user) and sede else effective_sede_scope(user) or sede
        if not sede_final:
            raise HTTPException(status_code=400, detail="Usuario sin sede asignada")
        numero = next_number(conn, "avisos", "AV")
        imagenes_guardadas = await guardar_imagenes_aviso(numero, imagenes)
        conn.execute(
            """
            INSERT INTO avisos
            (numero, usuario, rubro, sede, referencia, ubicacion, proceso, sistema, equipo,
             sub_equipo, tipo_equipo, equipo_codigo, creado, descripcion, prioridad, tipo_falla,
             tipo_aviso, tipo_servicio, estado, creado_en, componente, imagenes)
            VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTO', ?, ?, ?)
            """,
            (
                numero, user["username"], rubro, sede_final, ubicacion, proceso,
                sistema, equipo, sub_equipo, tipo_equipo, equipo_codigo,
                creado or user["username"], descripcion, prioridad, tipo_falla,
                tipo_aviso, tipo_servicio or "interno", now_iso(), componente,
                json.dumps(imagenes_guardadas, ensure_ascii=False),
            ),
        )
        detalle = descripcion
        if imagenes_guardadas:
            detalle = f"{descripcion} | {len(imagenes_guardadas)} imagen(es)"
        registrar_historial(conn, user["username"], "CREO AVISO", "avisos", numero, "", detalle)
        return {"numero": numero, "imagenes": imagenes_guardadas}


@app.post("/api/avisos/{numero}/atender")
def atender_aviso(numero: str, data: OTIn, user=Depends(current_user)):
    with connect() as conn:
        aviso = conn.execute("SELECT * FROM avisos WHERE numero = ?", (numero,)).fetchone()
        if not aviso:
            raise HTTPException(status_code=404, detail="Aviso no encontrado")
        assert_row_sede(aviso, user, "Aviso")
        if not is_admin_user(user):
            data.sede = user_sede(user)
        ot_numero = crear_ot_tx(conn, data, user, "aviso", numero)
        conn.execute("UPDATE avisos SET estado = 'CERRADO', ot_generada = ? WHERE numero = ?", (ot_numero, numero))
        registrar_historial(conn, user["username"], "CONVIRTIO AVISO EN OT", "avisos", numero, numero, ot_numero)
        return {"ot_numero": ot_numero}


@app.post("/api/avisos/{numero}/atencion")
def registrar_atencion_aviso(numero: str, data: AvisoAtencionIn, user=Depends(current_user)):
    sede_final = user_sede(user) if not is_admin_user(user) else canonical_sede(data.sede)
    required = {
        "sede": sede_final, "ubicacion": data.ubicacion, "proceso": data.proceso,
        "sistema": data.sistema, "equipo": data.equipo,
        "descripcion_falla": data.descripcion_falla, "trabajo_realizado": data.trabajo_realizado,
    }
    missing = [key for key, value in required.items() if not str(value or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Complete campos obligatorios: {', '.join(missing)}")
    with connect() as conn:
        aviso = conn.execute("SELECT * FROM avisos WHERE numero = ?", (numero,)).fetchone()
        if not aviso:
            raise HTTPException(status_code=404, detail="Aviso no encontrado")
        assert_row_sede(aviso, user, "Aviso")
        estado = (data.estado or "ATENDIDO").upper()
        conn.execute(
            """
            INSERT INTO aviso_atenciones
            (aviso_numero, tecnico, fecha_atencion, hora_inicio, hora_fin, sede, ubicacion,
             proceso, sistema, equipo, equipo_codigo, tipo_equipo, sub_equipo, componente,
             tipo_falla, tipo_intervencion, descripcion_falla,
             trabajo_realizado, observacion, estado, usuario, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                numero, data.tecnico, data.fecha_atencion, data.hora_inicio, data.hora_fin,
                sede_final, data.ubicacion, data.proceso, data.sistema, data.equipo,
                data.equipo_codigo or "", data.tipo_equipo or "", data.sub_equipo or "", data.componente or "",
                data.tipo_falla or "", data.tipo_intervencion or "", data.descripcion_falla,
                data.trabajo_realizado, data.observacion or "",
                estado, user["username"], now_iso(),
            ),
        )
        conn.execute(
            """
            UPDATE avisos
            SET estado=?, sede=?, ubicacion=?, proceso=?, sistema=?, equipo=?, equipo_codigo=?,
                tipo_equipo=?, sub_equipo=?, componente=?, tipo_falla=?, tipo_intervencion=?,
                descripcion_falla=?, trabajo_realizado=?, observaciones=?
            WHERE numero=?
            """,
            (
                estado, sede_final, data.ubicacion, data.proceso, data.sistema, data.equipo,
                data.equipo_codigo or "", data.tipo_equipo or "", data.sub_equipo or "", data.componente or "",
                data.tipo_falla or "", data.tipo_intervencion or "",
                data.descripcion_falla, data.trabajo_realizado, data.observacion or "", numero,
            ),
        )
        registrar_historial(conn, user["username"], "ATENDIO AVISO", "avisos", numero, aviso["estado"] or "", estado)
        return {"ok": True, "numero": numero, "estado": estado}


@app.delete("/api/avisos/{numero}")
def eliminar_aviso(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        aviso = conn.execute("SELECT * FROM avisos WHERE numero = ?", (numero,)).fetchone()
        if not aviso:
            raise HTTPException(status_code=404, detail="Aviso no encontrado")
        assert_row_sede(aviso, user, "Aviso")
        conn.execute("UPDATE avisos SET estado = 'CANCELADO' WHERE numero = ?", (numero,))
        registrar_historial(conn, user["username"], "ELIMINO AVISO", "avisos", numero, aviso["estado"] or "", "CANCELADO")
        return {"ok": True}


@app.get("/api/ots")
def listar_ots(user=Depends(current_user)):
    with connect() as conn:
        extra, params = sede_scope_sql(user, alias="o")
        return [dict(r) for r in conn.execute(
            f"""
            SELECT o.*, c.calificacion, c.promedio, c.comentario AS calificacion_comentario
            FROM ots o
            LEFT JOIN ot_calificaciones c ON c.ot_numero = o.numero
            WHERE 1 = 1 {extra}
            ORDER BY o.id DESC
            """,
            params,
        )]


@app.post("/api/ots")
def crear_ot(data: OTIn, user=Depends(current_user)):
    with connect() as conn:
        numero = crear_ot_tx(conn, data, user, data.origen or "manual", data.aviso_numero or "")
        return {"numero": numero}


@app.delete("/api/ots/{numero}")
def eliminar_ot(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")
        conn.execute("UPDATE ots SET estado = 'CANCELADA' WHERE numero = ?", (numero,))
        registrar_evento(conn, numero, "ELIMINACION LOGICA", "CANCELADA", user["username"], ot["tecnico_1"], "OT cancelada")
        registrar_historial(conn, user["username"], "ELIMINO OT", "ots", numero, ot["estado"] or "", "CANCELADA")
        return {"ok": True}


@app.post("/api/ots/{numero}/atender")
def atender_ot(numero: str, data: OTAtenderIn, user=Depends(require_tecnico)):
    if data.estado_final not in {"TERMINADA", "CERRADA", "EN EJECUCION", "EN PROCESO", "CANCELADA", "ATENDIDA"}:
        raise HTTPException(status_code=400, detail="Estado final no permitido")
    estado_final = "TERMINADA" if data.estado_final == "ATENDIDA" else data.estado_final
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")
        validar_tecnico_conn(conn, data.tecnico, user)
        cierre_en = now_iso()
        cur = conn.execute(
            """
            UPDATE ots
            SET fecha_atencion=?, tecnico_1=COALESCE(NULLIF(?, ''), tecnico_1), trabajo_realizado=?,
                observaciones=?, estado=?, cerrado_en=?, usuario_cierre=?
            WHERE numero=?
            """,
            (data.fecha_atencion, data.tecnico, data.trabajo_realizado, data.observaciones, estado_final, cierre_en, user["username"], numero),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        registrar_evento(conn, numero, "CIERRE TECNICO", estado_final, user["username"], data.tecnico, data.trabajo_realizado)
        registrar_historial(conn, user["username"], "CERRO OT", "ots", numero, "", estado_final)
        return {"ok": True}


@app.post("/api/ots/{numero}/cerrar")
def cerrar_ot(numero: str, data: Optional[OTCerrarIn] = None, user=Depends(current_user)):
    cierre_en = now_iso()
    fecha_cierre = (data.fecha_atencion if data and data.fecha_atencion else cierre_en[:10])
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")
        estado_actual = str(ot["estado"] or "").upper()
        if estado_actual in {"CERRADA", "TERMINADA", "CALIFICADA", "CANCELADA"}:
            raise HTTPException(status_code=400, detail="La OT ya no esta pendiente de cierre")
        conn.execute(
            """
            UPDATE ots
            SET estado='CERRADA', fecha_atencion=COALESCE(NULLIF(fecha_atencion, ''), ?), cerrado_en=?, usuario_cierre=?
            WHERE numero=?
            """,
            (fecha_cierre, cierre_en, user["username"], numero),
        )
        registrar_evento(conn, numero, "CIERRE", "CERRADA", user["username"], ot["tecnico_1"], "OT cerrada desde Cerrar OT's")
        registrar_historial(conn, user["username"], "CERRO OT", "ots", numero, estado_actual, "CERRADA")
        return {"ok": True, "numero": numero, "estado": "CERRADA", "fecha_cierre": fecha_cierre, "cerrado_en": cierre_en}


@app.get("/api/ots/{numero}/calificacion")
def obtener_calificacion(numero: str, user=Depends(current_user)):
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if ot:
            assert_row_sede(ot, user, "OT")
        row = conn.execute("SELECT * FROM ot_calificaciones WHERE ot_numero = ?", (numero,)).fetchone()
        return dict(row) if row else {"calificada": False}


@app.delete("/api/ots/{numero}/calificacion")
def eliminar_calificacion_ot(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")
        calificacion = conn.execute("SELECT * FROM ot_calificaciones WHERE ot_numero = ?", (numero,)).fetchone()
        if not calificacion:
            raise HTTPException(status_code=404, detail="Calificacion no encontrada")
        conn.execute("DELETE FROM ot_calificaciones WHERE ot_numero = ?", (numero,))
        conn.execute("UPDATE ots SET estado = 'CERRADA' WHERE numero = ?", (numero,))
        registrar_evento(conn, numero, "ELIMINO CALIFICACION", "CERRADA", user["username"], ot["tecnico_1"], "Calificacion eliminada")
        registrar_historial(conn, user["username"], "ELIMINO CALIFICACION", "ots", numero, str(calificacion["promedio"] or calificacion["calificacion"] or ""), "CERRADA")
        return {"ok": True, "message": "Calificacion eliminada correctamente"}


@app.get("/api/calificaciones")
def listar_calificaciones(desde: Optional[str] = "", hasta: Optional[str] = "", numero: Optional[str] = "", area: Optional[str] = "", usuario: Optional[str] = "", minimo: Optional[float] = None, user=Depends(current_user)):
    sql = """
        SELECT c.*, o.sede, o.ubicacion, o.proceso, o.sistema, o.equipo,
               o.equipo_codigo, o.tecnico_1, o.estado AS ot_estado
        FROM ot_calificaciones c
        LEFT JOIN ots o ON o.numero = c.ot_numero
        WHERE 1 = 1
    """
    params = []
    scope_sql, scope_params = sede_scope_sql(user, alias="o")
    sql += scope_sql
    params.extend(scope_params)
    if desde:
        sql += " AND substr(c.fecha, 1, 10) >= ?"
        params.append(desde)
    if hasta:
        sql += " AND substr(c.fecha, 1, 10) <= ?"
        params.append(hasta)
    if numero:
        sql += " AND lower(c.ot_numero) LIKE ?"
        params.append(f"%{numero.lower()}%")
    if area:
        sql += " AND (lower(COALESCE(o.ubicacion, '')) LIKE ? OR lower(COALESCE(o.sede, '')) LIKE ?)"
        params.extend([f"%{area.lower()}%", f"%{area.lower()}%"])
    if usuario:
        sql += " AND lower(COALESCE(c.usuario, '')) LIKE ?"
        params.append(f"%{usuario.lower()}%")
    if minimo is not None:
        sql += " AND COALESCE(c.promedio, c.calificacion, 0) >= ?"
        params.append(minimo)
    sql += " ORDER BY c.fecha DESC, c.id DESC"
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql, params)]


@app.get("/api/calificaciones/exportar-excel")
def exportar_calificaciones_excel(
    desde: Optional[str] = "",
    hasta: Optional[str] = "",
    numero: Optional[str] = "",
    area: Optional[str] = "",
    usuario: Optional[str] = "",
    minimo: Optional[float] = None,
    user=Depends(current_user),
):
    sql = """
        SELECT c.ot_numero AS OT, c.fecha AS Fecha, c.usuario AS Calificado_por,
               c.tecnico AS Personal, o.sede AS Sede, o.ubicacion AS Ubicacion,
               o.proceso AS Proceso, o.sistema AS Sistema, o.equipo AS Equipo,
               o.equipo_codigo AS Codigo_equipo, c.limpieza AS Limpieza,
               c.calidad AS Calidad, c.tiempo AS Tiempo, c.orden AS Orden,
               c.promedio AS Promedio, c.comentario AS Comentario
        FROM ot_calificaciones c
        LEFT JOIN ots o ON o.numero = c.ot_numero
        WHERE 1 = 1
    """
    params = []
    scope_sql, scope_params = sede_scope_sql(user, alias="o")
    sql += scope_sql
    params.extend(scope_params)
    if desde:
        sql += " AND substr(c.fecha, 1, 10) >= ?"
        params.append(desde)
    if hasta:
        sql += " AND substr(c.fecha, 1, 10) <= ?"
        params.append(hasta)
    if numero:
        sql += " AND lower(c.ot_numero) LIKE ?"
        params.append(f"%{numero.lower()}%")
    if area:
        sql += " AND (lower(COALESCE(o.ubicacion, '')) LIKE ? OR lower(COALESCE(o.sede, '')) LIKE ?)"
        params.extend([f"%{area.lower()}%", f"%{area.lower()}%"])
    if usuario:
        sql += " AND lower(COALESCE(c.usuario, '')) LIKE ?"
        params.append(f"%{usuario.lower()}%")
    if minimo is not None:
        sql += " AND COALESCE(c.promedio, c.calificacion, 0) >= ?"
        params.append(minimo)
    sql += " ORDER BY c.fecha DESC, c.id DESC"
    with connect() as conn:
        data = [dict(r) for r in conn.execute(sql, params)]

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(data).to_excel(writer, sheet_name="Calificaciones", index=False)
    buffer.seek(0)
    nombre = f"HISTORIAL_CALIFICACIONES_{desde or 'inicio'}_{hasta or 'fin'}.xlsx".replace("/", "-")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@app.post("/api/ots/{numero}/calificacion")
def calificar_ot(numero: str, data: CalificacionIn, user=Depends(require_jefe)):
    factores = [data.limpieza, data.calidad, data.tiempo, data.orden]
    if any(valor < 1 or valor > 5 for valor in factores):
        raise HTTPException(status_code=400, detail="Cada factor debe calificarse de 1 a 5")
    promedio = round(sum(factores) / len(factores), 2)
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")
        if ot["estado"] != "CERRADA":
            raise HTTPException(status_code=400, detail="Solo se califican OT cerradas")
        exists = conn.execute("SELECT id FROM ot_calificaciones WHERE ot_numero = ?", (numero,)).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Esta OT ya fue calificada")
        conn.execute(
            """
            INSERT INTO ot_calificaciones
            (ot_numero, fecha, usuario, tecnico, calificacion, comentario, calidad, limpieza, tiempo, orden,
             seguridad, cumplimiento, solucion, atencion, promedio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (numero, now_iso(), user["username"], ot["tecnico_1"], round(promedio), data.comentario, data.calidad,
             data.limpieza, data.tiempo, data.orden, data.seguridad, data.cumplimiento, data.solucion, data.atencion, promedio),
        )
        registrar_evento(conn, numero, "CALIFICACION", ot["estado"], user["username"], ot["tecnico_1"], f"{promedio}/5")
        registrar_historial(conn, user["username"], "CALIFICO OT", "ots", numero, "", f"{promedio}/5")
        return {"ok": True, "promedio": promedio}


@app.get("/api/peticiones")
def listar_peticiones(user=Depends(current_user)):
    with connect() as conn:
        scope, params = peticion_sede_scope_sql(user, "u")
        return [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT p.*, COALESCE(NULLIF(p.sede, ''), u.sede, per.sede, '') AS sede,
                       COALESCE(u.area, per.area, '') AS area
                FROM peticiones p
                LEFT JOIN users u ON u.username = p.usuario
                LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, ''))
                WHERE UPPER(COALESCE(p.estado, '')) IN ('PENDIENTE', 'PENDIENTES')
                  {scope}
                ORDER BY p.id DESC
                """,
                params,
            )
        ]


@app.post("/api/peticiones")
def crear_peticion(data: PeticionIn, user=Depends(current_user)):
    with connect() as conn:
        numero = next_number(conn, "peticiones", "PI")
        sede = effective_sede_scope(user)
        if not sede:
            raise HTTPException(status_code=400, detail="Usuario sin sede asignada")
        conn.execute(
            """
            INSERT INTO peticiones
            (numero, usuario, sede, ot_numero, item_codigo, item_nombre, cantidad, unidad, motivo, criticidad, estado, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
            """,
            (numero, user["username"], sede, data.ot_numero, data.item_codigo, data.item_nombre, data.cantidad, data.unidad, data.motivo, data.criticidad or "", now_iso()),
        )
        conn.execute(
            """
            INSERT INTO peticiones_detalle
            (peticion_numero, tabla, item_id, item_codigo, item_nombre, cantidad, unidad)
            VALUES (?, '', NULL, ?, ?, ?, ?)
            """,
            (numero, data.item_codigo, data.item_nombre, data.cantidad, data.unidad),
        )
        registrar_historial(conn, user["username"], "CREO PETICION", "peticiones", numero, "", data.item_nombre)
        return {"numero": numero, "estado": "PENDIENTE"}


@app.post("/api/peticiones-carrito")
def crear_peticion_carrito(data: PeticionCartIn, user=Depends(current_user)):
    if not data.items:
        raise HTTPException(status_code=400, detail="La peticion no tiene items")
    total = sum(float(item.cantidad or 0) for item in data.items)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Cantidad invalida")
    with connect() as conn:
        numero = next_number(conn, "peticiones", "PI")
        first = data.items[0]
        sede = effective_sede_scope(user)
        if not sede:
            raise HTTPException(status_code=400, detail="Usuario sin sede asignada")
        conn.execute(
            """
            INSERT INTO peticiones
            (numero, usuario, sede, ot_numero, item_codigo, item_nombre, cantidad, unidad, motivo, criticidad, estado, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
            """,
            (numero, user["username"], sede, data.ot_numero or "", first.codigo, first.descripcion, total, first.unidad or "", data.motivo or "", data.criticidad or "", now_iso()),
        )
        for item in data.items:
            if item.cantidad <= 0:
                raise HTTPException(status_code=400, detail=f"Cantidad invalida para {item.codigo}")
            conn.execute(
                """
                INSERT INTO peticiones_detalle
                (peticion_numero, tabla, item_id, item_codigo, item_nombre, cantidad, unidad)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (numero, item.tabla or "", item.item_id, item.codigo, item.descripcion, item.cantidad, item.unidad or ""),
            )
        registrar_historial(conn, user["username"], "CREO PETICION", "peticiones", numero, "", f"{len(data.items)} items")
        return {"numero": numero, "estado": "PENDIENTE"}


@app.get("/api/peticiones-historial")
def listar_peticiones_historial(user=Depends(current_user)):
    with connect() as conn:
        scope, params = peticion_sede_scope_sql(user, "u")
        return [dict(r) for r in conn.execute(
            f"""
            SELECT p.*, COALESCE(NULLIF(p.sede, ''), u.sede, per.sede, '') AS sede,
                   COALESCE(u.area, per.area, '') AS area, COALESCE(COUNT(d.id), 0) AS items_count
            FROM peticiones p
            LEFT JOIN users u ON u.username = p.usuario
            LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, ''))
            LEFT JOIN peticiones_detalle d ON d.peticion_numero = p.numero
            WHERE 1 = 1 {scope}
            GROUP BY p.id
            ORDER BY p.id DESC
            """,
            params,
        )]


@app.delete("/api/peticiones/{numero}")
def eliminar_peticion(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        peticion = conn.execute("SELECT * FROM peticiones WHERE numero = ?", (numero,)).fetchone()
        if not peticion:
            raise HTTPException(status_code=404, detail="Peticion no encontrada")
        assert_peticion_scope(conn, numero, user)
        conn.execute("DELETE FROM peticiones_detalle WHERE peticion_numero = ?", (numero,))
        conn.execute("DELETE FROM peticiones WHERE numero = ?", (numero,))
        registrar_historial(
            conn,
            user["username"],
            "ELIMINO PETICION",
            "peticiones",
            numero,
            str(peticion["estado"] or ""),
            "",
        )
        return {"ok": True}


@app.get("/api/peticiones/{numero}/detalle")
def detalle_peticion(numero: str, user=Depends(current_user)):
    with connect() as conn:
        peticion = conn.execute("SELECT * FROM peticiones WHERE numero = ?", (numero,)).fetchone()
        if not peticion:
            raise HTTPException(status_code=404, detail="Peticion no encontrada")
        assert_peticion_scope(conn, numero, user)
        items = [dict(r) for r in conn.execute("SELECT * FROM peticiones_detalle WHERE peticion_numero = ?", (numero,))]
        if not items:
            items = [dict(peticion)]
        result = dict(peticion)
        result["items"] = items
        return result


@app.post("/api/peticiones/{numero}/aceptar")
def aceptar_peticion(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        peticion = conn.execute("SELECT * FROM peticiones WHERE numero = ?", (numero,)).fetchone()
        if not peticion:
            raise HTTPException(status_code=404, detail="Peticion no encontrada")
        assert_peticion_scope(conn, numero, user)
        if str(peticion["estado"] or "").upper() != "PENDIENTE":
            raise HTTPException(status_code=400, detail="Solo se aceptan peticiones pendientes")
        conn.execute("UPDATE peticiones SET estado = 'ACEPTADA' WHERE numero = ?", (numero,))
        registrar_historial(conn, user["username"], "ACEPTO PETICION", "peticiones", numero, "PENDIENTE", "ACEPTADA")
        return {"ok": True}


@app.post("/api/peticiones/{numero}/salida")
def marcar_salida_peticion(numero: str, user=Depends(require_jefe)):
    with connect() as conn:
        peticion = conn.execute("SELECT * FROM peticiones WHERE numero = ?", (numero,)).fetchone()
        if not peticion:
            raise HTTPException(status_code=404, detail="Peticion no encontrada")
        assert_peticion_scope(conn, numero, user)
        if str(peticion["estado"] or "").upper() != "ACEPTADA":
            raise HTTPException(status_code=400, detail="Solo una peticion ACEPTADA puede marcar salida")
        items = [dict(r) for r in conn.execute("SELECT * FROM peticiones_detalle WHERE peticion_numero = ?", (numero,))]
        if not items:
            items = [{"tabla": "repuestos", "item_id": None, "item_codigo": peticion["item_codigo"], "item_nombre": peticion["item_nombre"], "cantidad": peticion["cantidad"], "unidad": peticion["unidad"]}]
        for item in items:
            tabla = item.get("tabla") if item.get("tabla") in {"productos", "repuestos"} else "repuestos"
            inv = conn.execute(
                f"SELECT * FROM {tabla} WHERE codigo = ? AND (? = '' OR norm_text(COALESCE(sede, '')) = norm_text(?))",
                (item["item_codigo"], peticion["sede"] or "", peticion["sede"] or ""),
            ).fetchone()
            if not inv:
                alt = "productos" if tabla == "repuestos" else "repuestos"
                inv = conn.execute(
                    f"SELECT * FROM {alt} WHERE codigo = ? AND (? = '' OR norm_text(COALESCE(sede, '')) = norm_text(?))",
                    (item["item_codigo"], peticion["sede"] or "", peticion["sede"] or ""),
                ).fetchone()
                if inv:
                    tabla = alt
            if not inv:
                raise HTTPException(status_code=400, detail=f"Item no encontrado en inventario: {item['item_codigo']}")
            stock = mtto_float(inv["cantidad"], 0)
            qty = mtto_float(item["cantidad"], 0)
            if qty <= 0:
                raise HTTPException(status_code=400, detail=f"Cantidad invalida para {item['item_codigo']}")
            if stock < qty:
                raise HTTPException(status_code=400, detail=f"STOCK INSUFICIENTE {item['item_codigo']}. Disponible: {stock}. Solicitado: {qty}")
        for item in items:
            tabla = item.get("tabla") if item.get("tabla") in {"productos", "repuestos"} else "repuestos"
            inv = conn.execute(
                f"SELECT * FROM {tabla} WHERE codigo = ? AND (? = '' OR norm_text(COALESCE(sede, '')) = norm_text(?))",
                (item["item_codigo"], peticion["sede"] or "", peticion["sede"] or ""),
            ).fetchone()
            if not inv:
                alt = "productos" if tabla == "repuestos" else "repuestos"
                inv = conn.execute(
                    f"SELECT * FROM {alt} WHERE codigo = ? AND (? = '' OR norm_text(COALESCE(sede, '')) = norm_text(?))",
                    (item["item_codigo"], peticion["sede"] or "", peticion["sede"] or ""),
                ).fetchone()
                tabla = alt if inv else tabla
            stock = mtto_float(inv["cantidad"], 0)
            qty = mtto_float(item["cantidad"], 0)
            nuevo = stock - qty
            conn.execute(f"UPDATE {tabla} SET cantidad = ? WHERE id = ?", (nuevo, inv["id"]))
            conn.execute(
                """
                INSERT INTO inventario_movimientos
                (peticion_numero, sede, tabla, item_id, item_codigo, descripcion, cantidad, unidad, usuario,
                 tipo_movimiento, stock_anterior, stock_posterior, creado_en)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SALIDA', ?, ?, ?)
                """,
                (numero, peticion["sede"] or "", tabla, inv["id"], item["item_codigo"], item["item_nombre"], qty, item.get("unidad") or "", user["username"], stock, nuevo, now_iso()),
            )
        conn.execute("UPDATE peticiones SET estado = 'SALIDA REALIZADA', atendido_por = ?, atendido_en = ? WHERE numero = ?", (user["username"], now_iso(), numero))
        registrar_historial(conn, user["username"], "SALIDA INVENTARIO", "peticiones", numero, "ACEPTADA", "SALIDA REALIZADA")
        return {"ok": True}


@app.get("/api/inventario-movimientos")
def listar_inventario_movimientos(user=Depends(current_user)):
    with connect() as conn:
        scope, params = movimiento_sede_scope_sql(user)
        return [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT m.*, COALESCE(NULLIF(m.sede, ''), p.sede, u.sede, per.sede, '') AS sede,
                       COALESCE(u.area, per.area, '') AS area
                FROM inventario_movimientos m
                LEFT JOIN peticiones p ON p.numero = m.peticion_numero
                LEFT JOIN users u ON u.username = COALESCE(p.usuario, m.usuario)
                LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, m.usuario, ''))
                WHERE 1 = 1 {scope}
                ORDER BY m.id DESC
                LIMIT 1000
                """,
                params,
            )
        ]


@app.get("/api/inventario-movimientos/exportar-excel")
def exportar_inventario_movimientos_excel(
    desde: Optional[str] = "",
    hasta: Optional[str] = "",
    user=Depends(current_user),
):
    sql = """
        SELECT m.creado_en, m.peticion_numero, m.tabla, m.item_codigo, m.descripcion, m.cantidad,
               m.unidad, m.tipo_movimiento, m.stock_anterior, m.stock_posterior, m.usuario,
               COALESCE(NULLIF(m.sede, ''), p.sede, u.sede, per.sede, '') AS sede,
               COALESCE(u.area, per.area, '') AS area
        FROM inventario_movimientos m
        LEFT JOIN peticiones p ON p.numero = m.peticion_numero
        LEFT JOIN users u ON u.username = COALESCE(p.usuario, m.usuario)
        LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, m.usuario, ''))
        WHERE 1 = 1
    """
    params = []
    scope, scope_params = movimiento_sede_scope_sql(user)
    sql += scope
    params.extend(scope_params)
    if desde:
        sql += " AND substr(m.creado_en, 1, 10) >= ?"
        params.append(desde)
    if hasta:
        sql += " AND substr(m.creado_en, 1, 10) <= ?"
        params.append(hasta)
    sql += " ORDER BY m.id DESC"
    with connect() as conn:
        data = [dict(r) for r in conn.execute(sql, params)]

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(data).to_excel(writer, sheet_name="Kardex", index=False)
    buffer.seek(0)
    nombre = f"KARDEX_{desde or 'inicio'}_{hasta or 'fin'}.xlsx".replace("/", "-")
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@app.delete("/api/inventario-movimientos/{movimiento_id}")
def eliminar_inventario_movimiento(movimiento_id: int, user=Depends(require_almacen_or_jefe)):
    with connect() as conn:
        mov = conn.execute(
            """
            SELECT m.*, COALESCE(NULLIF(m.sede, ''), p.sede, u.sede, per.sede, '') AS sede
            FROM inventario_movimientos m
            LEFT JOIN peticiones p ON p.numero = m.peticion_numero
            LEFT JOIN users u ON u.username = COALESCE(p.usuario, m.usuario)
            LEFT JOIN personal per ON norm_text(COALESCE(per.nombre, '')) = norm_text(COALESCE(u.full_name, p.usuario, m.usuario, ''))
            WHERE m.id = ?
            """,
            (movimiento_id,),
        ).fetchone()
        if not mov:
            raise HTTPException(status_code=404, detail="Movimiento de Kardex no encontrado")
        assert_row_sede(mov, user, "Movimiento de Kardex")
        conn.execute("DELETE FROM inventario_movimientos WHERE id = ?", (movimiento_id,))
        registrar_historial(
            conn,
            user["username"],
            "ELIMINO MOVIMIENTO KARDEX",
            "inventario_movimientos",
            str(movimiento_id),
            str(mov["tipo_movimiento"] or ""),
            str(mov["item_codigo"] or ""),
        )
        return {"ok": True}


@app.get("/api/inventario/exportar-excel")
def exportar_inventario_excel(
    tabla: Optional[str] = "",
    q: Optional[str] = "",
    stock: Optional[str] = "",
    user=Depends(current_user),
):
    tablas = [tabla] if tabla in {"productos", "repuestos"} else ["productos", "repuestos"]
    data = []
    query = mtto_norm(q)
    for table in tablas:
        with connect() as conn:
            scope, scope_params = sede_scope_sql(user)
            registros = [dict(r) for r in conn.execute(f"SELECT * FROM {table} WHERE 1 = 1 {scope} ORDER BY codigo", scope_params)]
        for row in registros:
            cantidad = mtto_float(row.get("cantidad"), 0)
            minimo = mtto_float(row.get("stock_minimo"), 0)
            maximo = mtto_float(row.get("stock_maximo"), 0)
            estado = "STOCK NORMAL"
            if minimo > 0 and cantidad <= minimo:
                estado = "STOCK BAJO"
            elif maximo > 0 and cantidad >= maximo:
                estado = "STOCK MAXIMO"
            if stock == "bajo" and estado != "STOCK BAJO":
                continue
            haystack = mtto_norm(" ".join([
                str(row.get("sede") or ""),
                str(row.get("codigo") or ""),
                str(row.get("codigo_barras") or ""),
                str(row.get("descripcion") or ""),
                str(row.get("modelo") or ""),
                str(row.get("ubicacion") or ""),
                str(row.get("unidad") or ""),
                str(row.get("categoria") or ""),
            ]))
            if query and query not in haystack:
                continue
            data.append({
                "SEDE": row.get("sede") or "",
                "CODIGO": row.get("codigo") or "",
                "DESCRIPCION": row.get("descripcion") or "",
                "MODELO": row.get("modelo") or "",
                "CANTIDAD": cantidad,
                "UBICACION": row.get("ubicacion") or "",
                "UNIDAD": row.get("unidad") or "",
                "MINIMO": minimo,
                "MAXIMO": maximo,
                "ESTADO": estado,
                "CODIGO_BARRAS": row.get("codigo_barras") or "",
                "CATEGORIA": row.get("categoria") or "",
            })

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(data).to_excel(writer, sheet_name="Almacen", index=False)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="ALMACEN.xlsx"'},
    )


@app.post("/api/inventario-ingreso")
def registrar_ingreso_inventario(data: InventarioIngresoIn, user=Depends(require_almacen_or_jefe)):
    tabla = data.tabla if data.tabla in {"productos", "repuestos"} else "repuestos"
    codigo = str(data.codigo or "").strip()
    descripcion = str(data.descripcion or "").strip()
    unidad = str(data.unidad or "").strip()
    cantidad = mtto_float(data.cantidad, 0)
    if not codigo:
        raise HTTPException(status_code=400, detail="Codigo obligatorio")
    if not descripcion:
        raise HTTPException(status_code=400, detail="Descripcion obligatoria")
    if cantidad <= 0:
        raise HTTPException(status_code=400, detail="Cantidad de ingreso invalida")

    sede_scope = data.sede or effective_sede_scope(user)
    if not is_admin_user(user):
        sede_scope = effective_sede_scope(user)
    if not sede_scope:
        raise HTTPException(status_code=400, detail="Usuario sin sede asignada")

    with connect() as conn:
        if data.codigo_barras and inventory_barcode_exists(conn, data.codigo_barras):
            raise HTTPException(status_code=400, detail="El codigo de barras ya existe en otro producto")
        inv = conn.execute(
            f"SELECT * FROM {tabla} WHERE codigo = ? AND norm_text(COALESCE(sede, '')) = norm_text(?)",
            (codigo, sede_scope),
        ).fetchone()
        if not inv:
            alt = "productos" if tabla == "repuestos" else "repuestos"
            inv = conn.execute(
                f"SELECT * FROM {alt} WHERE codigo = ? AND norm_text(COALESCE(sede, '')) = norm_text(?)",
                (codigo, sede_scope),
            ).fetchone()
            if inv:
                tabla = alt

        if inv:
            if data.codigo_barras and inventory_barcode_exists(conn, data.codigo_barras, tabla, inv["id"]):
                raise HTTPException(status_code=400, detail="El codigo de barras ya existe en otro producto")
            stock_anterior = mtto_float(inv["cantidad"], 0)
            stock_posterior = stock_anterior + cantidad
            conn.execute(
                f"""
                UPDATE {tabla}
                SET descripcion = COALESCE(NULLIF(?, ''), descripcion),
                    unidad = COALESCE(NULLIF(?, ''), unidad),
                    codigo_barras = COALESCE(NULLIF(?, ''), codigo_barras),
                    cantidad = ?
                WHERE id = ?
                """,
                (descripcion, unidad, data.codigo_barras or "", stock_posterior, inv["id"]),
            )
            item_id = inv["id"]
        else:
            stock_anterior = 0
            stock_posterior = cantidad
            sede = sede_scope
            cur = conn.execute(
                f"""
                INSERT INTO {tabla}
                (codigo, sede, tipo, categoria, area, descripcion, modelo, cantidad, ubicacion,
                 proveedor, unidad, codigo_barras, stock_minimo, stock_maximo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    codigo,
                    sede,
                    data.tipo or "",
                    data.categoria or "",
                    data.area or "",
                    descripcion,
                    data.modelo or "",
                    stock_posterior,
                    data.ubicacion or "",
                    data.proveedor or "",
                    unidad,
                    data.codigo_barras or "",
                    data.stock_minimo or 0,
                    data.stock_maximo or 0,
                ),
            )
            item_id = cur.lastrowid

        detalle = (data.observacion or data.motivo or "INGRESO").strip()
        conn.execute(
            """
            INSERT INTO inventario_movimientos
            (peticion_numero, sede, tabla, item_id, item_codigo, descripcion, cantidad, unidad, usuario,
             tipo_movimiento, stock_anterior, stock_posterior, creado_en)
            VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, 'INGRESO', ?, ?, ?)
            """,
            (sede_scope, tabla, item_id, codigo, descripcion, cantidad, unidad, user["username"], stock_anterior, stock_posterior, now_iso()),
        )
        registrar_historial(conn, user["username"], "INGRESO INVENTARIO", tabla, codigo, str(stock_anterior), f"{stock_posterior} {detalle}")
        return {"ok": True, "tabla": tabla, "codigo": codigo, "stock_actual": stock_posterior}


@app.patch("/api/inventario/{tabla}/{record_id}/codigo-barras")
def actualizar_codigo_barras(tabla: str, record_id: str, data: CodigoBarrasIn, user=Depends(require_almacen_or_jefe)):
    validar_tabla(tabla, {"productos", "repuestos"})
    with connect() as conn:
        row = get_inventory_row_for_user(conn, tabla, record_id, user)
        codigo = str(data.codigo_barras or "").strip()
        if data.generar or not codigo:
            codigo = generate_inventory_barcode(conn)
        duplicated = inventory_barcode_exists(conn, codigo, tabla, row["id"])
        if duplicated:
            raise HTTPException(status_code=400, detail=f"El codigo de barras ya existe en {duplicated.get('codigo') or duplicated.get('descripcion')}")
        conn.execute(f"UPDATE {tabla} SET codigo_barras = ? WHERE id = ?", (codigo, row["id"]))
        registrar_historial(conn, user["username"], "ACTUALIZO CODIGO BARRAS", tabla, row["codigo"], row["codigo_barras"] if "codigo_barras" in row.keys() else "", codigo)
        return {"ok": True, "tabla": tabla, "id": row["id"], "codigo": row["codigo"], "codigo_barras": codigo}


@app.post("/api/peticiones/{numero}/atender")
def atender_item(numero: str, user=Depends(current_user)):
    with connect() as conn:
        assert_peticion_scope(conn, numero, user)
        cur = conn.execute(
            """
            UPDATE peticiones SET estado = 'ATENDIDO', atendido_por = ?, atendido_en = ?
            WHERE numero = ? AND UPPER(COALESCE(estado, '')) != 'ATENDIDO'
            """,
            (user["username"], now_iso(), numero),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Peticion no encontrada o ya atendida")
        registrar_historial(conn, user["username"], "ATENDIO ITEM", "peticiones", numero, "PENDIENTE", "ATENDIDO")
        return {"ok": True}


@app.patch("/api/inventario/{tabla}/{record_id}/stock-limits")
def actualizar_limites_inventario(tabla: str, record_id: str, data: StockLimitsIn, user=Depends(require_admin)):
    validar_tabla(tabla, {"productos", "repuestos"})
    with connect() as conn:
        cantidad_sql = "cantidad = COALESCE(?, cantidad), "
        cantidad_value = data.cantidad if data.cantidad is not None else None
        if str(record_id).isdigit():
            cur = conn.execute(
                f"UPDATE {tabla} SET {cantidad_sql}stock_minimo=?, stock_maximo=? WHERE id=?",
                (cantidad_value, data.stock_minimo or 0, data.stock_maximo or 0, int(record_id)),
            )
        else:
            cur = conn.execute(
                f"UPDATE {tabla} SET {cantidad_sql}stock_minimo=?, stock_maximo=? WHERE codigo=?",
                (cantidad_value, data.stock_minimo or 0, data.stock_maximo or 0, record_id),
            )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Item de inventario no encontrado")
        registrar_historial(conn, user["username"], "CONFIGURO INVENTARIO", tabla, record_id, "", f"cantidad={data.cantidad}, min={data.stock_minimo}, max={data.stock_maximo}")
        return {"ok": True}


@app.post("/api/admin/reset-sistema")
def reset_sistema(user=Depends(require_admin)):
    tablas = [
        "aviso_atenciones",
        "ot_calificaciones",
        "ot_eventos",
        "peticiones_detalle",
        "peticiones",
        "inventario_movimientos",
        "avisos",
        "ots",
        "historial",
    ]
    with connect() as conn:
        for tabla in tablas:
            conn.execute(f"DELETE FROM {tabla}")
            conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", (tabla,))
        registrar_historial(
            conn,
            user["username"],
            "RESET SISTEMA",
            "sistema",
            "operativo",
            "",
            "Datos operativos reiniciados",
        )
        return {"ok": True, "tablas_limpiadas": tablas}


@app.get("/api/users")
def listar_usuarios(user=Depends(require_admin)):
    with connect() as conn:
        return [dict(r) for r in conn.execute(
            """
            SELECT id, username, full_name, apellidos, dni_codigo, sede, area, cargo, role, active, created_at
            FROM users ORDER BY username
            """
        )]


@app.post("/api/users")
def crear_usuario(data: UserIn, user=Depends(require_admin)):
    username = data.username.strip()
    if not username or not data.password:
        raise HTTPException(status_code=400, detail="Usuario y clave son obligatorios")
    role = normalize_role(data.role)
    validar_rol(role)
    sede = canonical_sede(data.sede)
    if role != "admin" and not sede:
        raise HTTPException(status_code=400, detail="Sede obligatoria para usuarios no administradores")
    salt, password_hash = hash_password(data.password)
    try:
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO users
                (username, full_name, apellidos, dni_codigo, sede, area, cargo, role, salt, password_hash, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (username, data.full_name or username, data.apellidos, data.dni_codigo, sede, data.area, data.cargo, role, salt, password_hash, int(data.active), now_iso()),
            )
            registrar_historial(conn, user["username"], "CREO USUARIO", "users", username, "", role)
            return {"ok": True}
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=400, detail="El usuario ya existe") from exc
        raise


@app.patch("/api/users/{username}")
def actualizar_usuario(username: str, data: UserUpdateIn, user=Depends(require_admin)):
    updates = {}
    if data.full_name is not None:
        updates["full_name"] = data.full_name
    if data.apellidos is not None:
        updates["apellidos"] = data.apellidos
    if data.dni_codigo is not None:
        updates["dni_codigo"] = data.dni_codigo
    if data.sede is not None:
        updates["sede"] = canonical_sede(data.sede)
    if data.area is not None:
        updates["area"] = data.area
    if data.cargo is not None:
        updates["cargo"] = data.cargo
    if data.role is not None:
        role = normalize_role(data.role)
        validar_rol(role)
        updates["role"] = role
    if data.active is not None:
        updates["active"] = int(data.active)
    if data.password:
        salt, password_hash = hash_password(data.password)
        updates["salt"] = salt
        updates["password_hash"] = password_hash
    if not updates:
        return {"ok": True}
    next_role = updates.get("role")
    next_sede = updates.get("sede")
    if next_role is not None or next_sede is not None:
        with connect() as conn:
            current = conn.execute("SELECT role, sede FROM users WHERE username = ?", (username,)).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        effective_role = normalize_role(next_role if next_role is not None else current["role"])
        effective_sede = canonical_sede(next_sede if next_sede is not None else current["sede"])
        if effective_role != "admin" and not effective_sede:
            raise HTTPException(status_code=400, detail="Sede obligatoria para usuarios no administradores")
    keys = list(updates.keys())
    sql = ", ".join([f"{k} = ?" for k in keys])
    with connect() as conn:
        cur = conn.execute(f"UPDATE users SET {sql} WHERE username = ?", [updates[k] for k in keys] + [username])
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        registrar_historial(conn, user["username"], "ACTUALIZO USUARIO", "users", username, "", ",".join(keys))
        return {"ok": True}


@app.delete("/api/users/{username}")
def desactivar_usuario(username: str, user=Depends(require_admin)):
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propio usuario")
    with connect() as conn:
        cur = conn.execute("UPDATE users SET active = 0 WHERE username = ?", (username,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        registrar_historial(conn, user["username"], "DESACTIVO USUARIO", "users", username, "activo", "inactivo")
        return {"ok": True}


# ================================================================
# IMPRESION OT - VALE INDUSTRIAL A4 / 2 OT POR HOJA
# ================================================================
VALE_EMPRESA = "ALIMENTOS CIELO SAC"
VALE_TITULO = "ORDEN DE TRABAJO"
VALE_SUBTITULO = "MANTENIMIENTO GENERAL"
VALE_VERSION = "1"
VALE_REVISION = "01"
VALE_FECHA_FORMATO = "MAYO 2024"
VALE_CODIGO_FORMATO = "ALICI-MTTO-F-02"
VALE_PAGE_W, VALE_PAGE_H = A4
VALE_MARGIN_X = 0.55 * cm
VALE_MARGIN_TOP = 0.45 * cm
VALE_MARGIN_BOTTOM = 0.45 * cm
VALE_GAP = 0.32 * cm
VALE_CONTENT_W = VALE_PAGE_W - (2 * VALE_MARGIN_X)
VALE_CONTENT_H = VALE_PAGE_H - VALE_MARGIN_TOP - VALE_MARGIN_BOTTOM
VALE_OT_H = (VALE_CONTENT_H - VALE_GAP) / 2
VALE_NAVY = colors.HexColor("#173F67")
VALE_NAVY_DARK = colors.HexColor("#102E4C")
VALE_BLUE = colors.HexColor("#2369A8")
VALE_BLUE_LIGHT = colors.HexColor("#EAF3FA")
VALE_BLUE_PALE = colors.HexColor("#F7FAFC")
VALE_TEXT = colors.HexColor("#1D2730")
VALE_MUTED = colors.HexColor("#667581")
VALE_BORDER = colors.HexColor("#81909D")
VALE_BORDER_LIGHT = colors.HexColor("#CBD5DD")
VALE_SHADOW = colors.HexColor("#DCE3E8")
VALE_GREEN = colors.HexColor("#278B42")


def vale_safe(value):
    if value is None:
        return ""
    value = str(value).strip()
    if value.lower() in {"none", "null", "undefined"}:
        return ""
    return value


def vale_first(ot, *keys):
    for key in keys:
        value = vale_safe(ot.get(key))
        if value:
            return value
    return ""


def vale_date_only(value):
    text = vale_safe(value)
    if "T" in text:
        text = text.split("T", 1)[0]
    if " " in text:
        text = text.split(" ", 1)[0]
    return text


def vale_fit_text(text, max_width, font="Helvetica", size=5.0):
    text = vale_safe(text)
    if not text or stringWidth(text, font, size) <= max_width:
        return text
    result = text
    while result and stringWidth(result + "...", font, size) > max_width:
        result = result[:-1]
    return result.rstrip() + "..." if result else ""


def vale_wrap_text(text, max_width, font="Helvetica", size=5.0, max_lines=3):
    text = vale_safe(text).replace("\r", "")
    if not text:
        return []
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            if stringWidth(candidate, font, size) <= max_width:
                line = candidate
            else:
                if line:
                    lines.append(line)
                line = word
            if len(lines) >= max_lines:
                break
        if line and len(lines) < max_lines:
            lines.append(line)
        if len(lines) >= max_lines:
            break
    return lines[:max_lines]


def vale_parse_minutes(value):
    text = vale_safe(value)
    if not text:
        return None
    parts = text.split(":")
    if len(parts) < 2:
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def vale_tiempo_parcial(inicio, termino):
    start = vale_parse_minutes(inicio)
    end = vale_parse_minutes(termino)
    if start is None or end is None:
        return ""
    if end < start:
        end += 24 * 60
    return f"{end - start} min"


def vale_shadow_box(pdf, x, y, w, h, fill=colors.white, stroke=VALE_BORDER_LIGHT):
    pdf.setFillColor(VALE_SHADOW)
    pdf.setStrokeColor(VALE_SHADOW)
    pdf.roundRect(x + 0.03 * cm, y - 0.03 * cm, w, h, 0.06 * cm, stroke=0, fill=1)
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke)
    pdf.setLineWidth(0.42)
    pdf.roundRect(x, y, w, h, 0.06 * cm, stroke=1, fill=1)


def vale_section_header(pdf, title, x, y, w, h):
    pdf.setFillColor(VALE_NAVY)
    pdf.setStrokeColor(VALE_NAVY)
    pdf.roundRect(x, y, w, h, 0.04 * cm, stroke=1, fill=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 4.9)
    pdf.drawString(x + 0.10 * cm, y + 0.10 * cm, vale_safe(title).upper())


def vale_field(pdf, label, value, x, y, w, h, label_ratio=0.38):
    label_w = w * label_ratio
    pdf.setFillColor(VALE_BLUE_LIGHT)
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.setLineWidth(0.25)
    pdf.rect(x, y, label_w, h, stroke=1, fill=1)
    pdf.setFillColor(colors.white)
    pdf.rect(x + label_w, y, w - label_w, h, stroke=1, fill=1)
    pdf.setFillColor(VALE_NAVY)
    pdf.setFont("Helvetica-Bold", 4.1)
    pdf.drawString(x + 0.055 * cm, y + h / 2 - 0.04 * cm, vale_safe(label).upper())
    pdf.setFillColor(VALE_TEXT)
    pdf.setFont("Helvetica", 4.85)
    pdf.drawString(x + label_w + 0.06 * cm, y + h / 2 - 0.04 * cm, vale_fit_text(value, w - label_w - 0.12 * cm, "Helvetica", 4.85))


def vale_draw_format_strip(pdf, x, y, w, h):
    pdf.setFillColor(VALE_NAVY_DARK)
    pdf.setStrokeColor(VALE_NAVY_DARK)
    pdf.roundRect(x, y, w, h, 0.04 * cm, stroke=1, fill=1)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 4.35)
    pdf.drawString(x + 0.12 * cm, y + 0.08 * cm, f"CODIGO DE FORMATO: {VALE_CODIGO_FORMATO}")
    pdf.drawRightString(x + w - 0.12 * cm, y + 0.08 * cm, f"REV. {VALE_REVISION} | {VALE_FECHA_FORMATO}")


def vale_draw_header(pdf, x, y, w, h):
    logo_w = 3.0 * cm
    control_w = 3.45 * cm
    title_w = w - logo_w - control_w
    vale_shadow_box(pdf, x, y, w, h, fill=colors.white, stroke=VALE_NAVY)
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.rect(x, y, logo_w, h, stroke=1, fill=1)
    logo_path = STATIC / "assets" / "logo-empresa.png"
    if logo_path.exists():
        try:
            pdf.drawImage(str(logo_path), x + 0.15 * cm, y + 0.12 * cm, width=logo_w - 0.30 * cm, height=h - 0.24 * cm, preserveAspectRatio=True, anchor="c", mask="auto")
        except Exception:
            pdf.setFillColor(VALE_NAVY)
            pdf.setFont("Helvetica-Bold", 6)
            pdf.drawCentredString(x + logo_w / 2, y + h / 2, VALE_EMPRESA)
    else:
        pdf.setFillColor(VALE_NAVY)
        pdf.setFont("Helvetica-Bold", 6)
        pdf.drawCentredString(x + logo_w / 2, y + h / 2, VALE_EMPRESA)
    tx = x + logo_w
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.rect(tx, y, title_w, h, stroke=1, fill=1)
    pdf.setFillColor(VALE_NAVY)
    pdf.setFont("Helvetica-Bold", 6.6)
    pdf.drawCentredString(tx + title_w / 2, y + h - 0.39 * cm, VALE_EMPRESA)
    pdf.setFont("Helvetica-Bold", 10.2)
    pdf.drawCentredString(tx + title_w / 2, y + h - 0.86 * cm, VALE_TITULO)
    pdf.setFont("Helvetica-Bold", 5.9)
    pdf.drawCentredString(tx + title_w / 2, y + 0.29 * cm, VALE_SUBTITULO)
    pdf.setStrokeColor(VALE_BLUE)
    pdf.setLineWidth(0.9)
    pdf.line(tx + 1.0 * cm, y + 0.18 * cm, tx + title_w - 1.0 * cm, y + 0.18 * cm)
    cx = tx + title_w
    pdf.setFillColor(VALE_BLUE_LIGHT)
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.rect(cx, y, control_w, h, stroke=1, fill=1)
    rows_data = [("VERSION", VALE_VERSION), ("REVISION", VALE_REVISION), ("FECHA", VALE_FECHA_FORMATO), ("CODIGO", VALE_CODIGO_FORMATO)]
    rh = h / len(rows_data)
    label_w = 1.04 * cm
    for i, (label, value) in enumerate(rows_data):
        ry = y + h - (i + 1) * rh
        pdf.setFillColor(VALE_NAVY)
        pdf.rect(cx, ry, label_w, rh, stroke=0, fill=1)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 4.0)
        pdf.drawString(cx + 0.06 * cm, ry + rh / 2 - 0.04 * cm, label)
        pdf.setFillColor(VALE_TEXT)
        pdf.setFont("Helvetica-Bold", 4.35)
        pdf.drawString(cx + label_w + 0.07 * cm, ry + rh / 2 - 0.04 * cm, vale_fit_text(value, control_w - label_w - 0.14 * cm, "Helvetica-Bold", 4.35))


def vale_draw_status(pdf, estado, x, y, w, h):
    label_w = 2.1 * cm
    pdf.setFillColor(VALE_BLUE_LIGHT)
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.rect(x, y, label_w, h, stroke=1, fill=1)
    pdf.setFillColor(VALE_NAVY)
    pdf.setFont("Helvetica-Bold", 4.65)
    pdf.drawString(x + 0.07 * cm, y + h / 2 - 0.04 * cm, "ESTADO DE OT:")
    pdf.setFillColor(colors.white)
    pdf.rect(x + label_w, y, w - label_w, h, stroke=1, fill=1)
    estado = vale_safe(estado).upper()
    ok_states = {"CERRADO", "CERRADA", "TERMINADA", "CALIFICADA", "COMPLETADO", "COMPLETADA"}
    if estado in ok_states:
        pill_w = min(2.0 * cm, w - label_w - 0.2 * cm)
        pill_h = 0.27 * cm
        px = x + label_w + 0.10 * cm
        py = y + (h - pill_h) / 2
        pdf.setFillColor(VALE_GREEN)
        pdf.roundRect(px, py, pill_w, pill_h, 0.05 * cm, stroke=0, fill=1)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 4.35)
        pdf.drawCentredString(px + pill_w / 2, py + 0.085 * cm, vale_fit_text(estado, pill_w - 0.1 * cm, "Helvetica-Bold", 4.35))
    else:
        pdf.setFillColor(VALE_TEXT)
        pdf.setFont("Helvetica-Bold", 4.85)
        pdf.drawString(x + label_w + 0.10 * cm, y + h / 2 - 0.04 * cm, estado)


def vale_draw_general_data(pdf, ot, x, y, w):
    row_h = 0.34 * cm
    gap = 0.022 * cm
    vale_draw_status(pdf, ot.get("estado"), x, y - row_h, w, row_h)
    y -= row_h + gap
    for row in [
        [("ORDEN DE TRABAJO", ot.get("numero"), 0.28), ("FECHA", vale_date_only(ot.get("creado_en")), 0.20), ("SOLICITUD", ot.get("aviso_numero"), 0.25), ("TIPO", vale_first(ot, "tipo_servicio", "tipo_intervencion"), 0.27)],
        [("AREA", vale_first(ot, "ubicacion", "sede"), 0.22), ("LINEA", vale_first(ot, "sistema", "proceso"), 0.18), ("EQUIPO", ot.get("equipo"), 0.28), ("COD. EQUIPO", ot.get("equipo_codigo"), 0.16), ("PARADA", ot.get("parada_linea"), 0.16)],
        [("FECHA INICIO", vale_date_only(vale_first(ot, "fecha_intervencion", "creado_en")), 0.25), ("FECHA TERMINO", vale_date_only(vale_first(ot, "fecha_atencion", "cerrado_en")), 0.25), ("TIPO DE INTERVENCION", ot.get("tipo_intervencion"), 0.50)],
    ]:
        xx = x
        for label, value, ratio in row:
            cw = w * ratio
            vale_field(pdf, label, value, xx, y - row_h, cw, row_h, 0.42 if label == "COD. EQUIPO" else 0.36)
            xx += cw
        y -= row_h + gap
    return y + gap


def vale_draw_tecnicos(pdf, ot, x, y, w, h):
    vale_shadow_box(pdf, x, y, w, h)
    title_h = 0.29 * cm
    header_h = 0.26 * cm
    vale_section_header(pdf, "TECNICO DE MANTENIMIENTO", x, y + h - title_h, w, title_h)
    columns = [("TECNICO", 0.38), ("H. INICIO", 0.13), ("H. TERMINO", 0.13), ("T. PARCIAL", 0.17), ("FECHA", 0.19)]
    table_top = y + h - title_h
    xx = x
    for label, ratio in columns:
        cw = w * ratio
        pdf.setFillColor(VALE_NAVY_DARK)
        pdf.setStrokeColor(colors.white)
        pdf.rect(xx, table_top - header_h, cw, header_h, stroke=1, fill=1)
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 3.95)
        pdf.drawCentredString(xx + cw / 2, table_top - header_h + 0.085 * cm, label)
        xx += cw
    row_h = (h - title_h - header_h) / 3
    tecnicos = [vale_safe(ot.get("tecnico_1")), vale_safe(ot.get("tecnico_2")), vale_safe(ot.get("tecnico_3"))]
    inicio = vale_safe(ot.get("hora_inicio"))
    termino = vale_safe(ot.get("hora_fin"))
    parcial = vale_tiempo_parcial(inicio, termino)
    fecha = vale_date_only(vale_first(ot, "fecha_intervencion", "fecha_atencion", "creado_en"))
    for r in range(3):
        row_y = table_top - header_h - ((r + 1) * row_h)
        values = [tecnicos[r], inicio if tecnicos[r] else "", termino if tecnicos[r] else "", parcial if tecnicos[r] else "", fecha if tecnicos[r] else ""]
        xx = x
        for i, (_, ratio) in enumerate(columns):
            cw = w * ratio
            pdf.setFillColor(colors.white if r % 2 == 0 else VALE_BLUE_PALE)
            pdf.setStrokeColor(VALE_BORDER_LIGHT)
            pdf.rect(xx, row_y, cw, row_h, stroke=1, fill=1)
            pdf.setFillColor(VALE_TEXT)
            pdf.setFont("Helvetica", 4.55)
            pdf.drawCentredString(xx + cw / 2, row_y + row_h / 2 - 0.032 * cm, vale_fit_text(values[i], cw - 0.12 * cm, "Helvetica", 4.55))
            xx += cw


def vale_draw_text_section(pdf, title, value, x, y, w, h, max_lines):
    vale_shadow_box(pdf, x, y, w, h)
    header_h = 0.29 * cm
    vale_section_header(pdf, title, x, y + h - header_h, w, header_h)
    lines = vale_wrap_text(value, w - 0.28 * cm, "Helvetica", 4.9, max_lines)
    pdf.setFillColor(VALE_TEXT)
    pdf.setFont("Helvetica", 4.9)
    text_y = y + h - header_h - 0.24 * cm
    for line in lines:
        pdf.drawString(x + 0.14 * cm, text_y, line)
        text_y -= 0.245 * cm


def vale_draw_signatures(pdf, ot, x, y, w, h):
    vale_shadow_box(pdf, x, y, w, h)
    labels = [("TECNICO 1", vale_safe(ot.get("tecnico_1"))), ("TECNICO 2", vale_safe(ot.get("tecnico_2"))), ("SUPERVISOR", ""), ("JEFE DE AREA", "")]
    col_w = w / 4
    for i, (label, name) in enumerate(labels):
        xx = x + i * col_w
        pdf.setFillColor(colors.white if i % 2 == 0 else VALE_BLUE_PALE)
        pdf.setStrokeColor(VALE_BORDER_LIGHT)
        pdf.rect(xx, y, col_w, h, stroke=1, fill=1)
        pdf.setFillColor(VALE_NAVY)
        pdf.setFont("Helvetica-Bold", 3.85)
        pdf.drawCentredString(xx + col_w / 2, y + h - 0.20 * cm, label)
        pdf.setFillColor(VALE_TEXT)
        pdf.setFont("Helvetica", 4.05)
        pdf.drawCentredString(xx + col_w / 2, y + h - 0.39 * cm, vale_fit_text(name, col_w - 0.16 * cm, "Helvetica", 4.05))
        pdf.setStrokeColor(VALE_BORDER)
        pdf.setLineWidth(0.33)
        pdf.line(xx + 0.30 * cm, y + 0.15 * cm, xx + col_w - 0.30 * cm, y + 0.15 * cm)
        pdf.setFillColor(VALE_MUTED)
        pdf.setFont("Helvetica-Bold", 3.45)
        pdf.drawCentredString(xx + col_w / 2, y + 0.045 * cm, "FIRMA")


def vale_draw_footer(pdf, page_number, total_pages):
    y = 0.15 * cm
    pdf.setStrokeColor(VALE_BORDER_LIGHT)
    pdf.setLineWidth(0.32)
    pdf.line(VALE_MARGIN_X, y + 0.21 * cm, VALE_PAGE_W - VALE_MARGIN_X, y + 0.21 * cm)
    pdf.setFillColor(VALE_NAVY)
    pdf.setFont("Helvetica-Bold", 3.75)
    pdf.drawString(VALE_MARGIN_X + 0.08 * cm, y, f"CODIGO: {VALE_CODIGO_FORMATO}")
    pdf.drawCentredString(VALE_PAGE_W / 2, y, f"REVISION: {VALE_REVISION}")
    pdf.drawRightString(VALE_PAGE_W - VALE_MARGIN_X - 0.08 * cm, y, f"PAGINA {page_number} DE {total_pages}")


def vale_draw_ot(pdf, ot, x, y, w, h):
    vale_shadow_box(pdf, x, y, w, h, fill=colors.white, stroke=VALE_NAVY)
    inner_x = x + 0.18 * cm
    inner_w = w - 0.36 * cm
    cursor = y + h - 0.14 * cm
    strip_h = 0.24 * cm
    cursor -= strip_h
    vale_draw_format_strip(pdf, inner_x, cursor, inner_w, strip_h)
    cursor -= 0.06 * cm
    header_h = 1.42 * cm
    cursor -= header_h
    vale_draw_header(pdf, inner_x, cursor, inner_w, header_h)
    cursor -= 0.06 * cm
    cursor = vale_draw_general_data(pdf, ot, inner_x, cursor, inner_w)
    cursor -= 0.06 * cm
    tech_h = 1.18 * cm
    cursor -= tech_h
    vale_draw_tecnicos(pdf, ot, inner_x, cursor, inner_w, tech_h)
    cursor -= 0.06 * cm
    causa_h = 0.78 * cm
    cursor -= causa_h
    vale_draw_text_section(pdf, "DESCRIPCION / CAUSA DE LA FALLA", vale_first(ot, "descripcion_falla", "tipo_falla", "descripcion_trabajo"), inner_x, cursor, inner_w, causa_h, max_lines=2)
    cursor -= 0.06 * cm
    firmas_h = 0.78 * cm
    obs_h = 0.64 * cm
    bottom = y + 0.16 * cm
    available_for_work = cursor - bottom - obs_h - firmas_h - (0.06 * cm * 2)
    trabajo_h = max(1.48 * cm, available_for_work)
    cursor -= trabajo_h
    vale_draw_text_section(pdf, "DESCRIPCION DEL TRABAJO DE MANTENIMIENTO", vale_first(ot, "trabajo_realizado", "descripcion_trabajo"), inner_x, cursor, inner_w, trabajo_h, max_lines=6)
    cursor -= 0.06 * cm
    cursor -= obs_h
    vale_draw_text_section(pdf, "OBSERVACION", ot.get("observaciones"), inner_x, cursor, inner_w, obs_h, max_lines=2)
    vale_draw_signatures(pdf, ot, inner_x, bottom, inner_w, firmas_h)


@app.get("/api/ots/imprimir-pdf")
def imprimir_ots_pdf(numeros: Optional[str] = "", desde: Optional[str] = "", hasta: Optional[str] = "", estado: Optional[str] = "", tecnico: Optional[str] = "", sede: Optional[str] = "", equipo: Optional[str] = "", codigo: Optional[str] = "", user=Depends(current_user)):
    ots = buscar_ots(desde, hasta, estado, tecnico, sede, equipo, numeros, codigo, user=user)
    if not ots:
        raise HTTPException(status_code=404, detail="No existen OT para imprimir")
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"{VALE_TITULO} - {VALE_CODIGO_FORMATO}")
    pdf.setAuthor(VALE_EMPRESA)
    total_pages = (len(ots) + 1) // 2
    for page_index in range(total_pages):
        first_index = page_index * 2
        for slot in range(2):
            index = first_index + slot
            if index >= len(ots):
                break
            ot_y = VALE_PAGE_H - VALE_MARGIN_TOP - VALE_OT_H if slot == 0 else VALE_MARGIN_BOTTOM
            vale_draw_ot(pdf, dict(ots[index]), VALE_MARGIN_X, ot_y, VALE_CONTENT_W, VALE_OT_H)
        vale_draw_footer(pdf, page_index + 1, total_pages)
        if page_index < total_pages - 1:
            pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="ORDENES_TRABAJO_2_POR_HOJA.pdf"'})


def pdf_table(rows_data):
    table = Table([[k or "", v or ""] for k, v in rows_data], colWidths=[4.4 * cm, 12 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E8F4FF")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#10243F")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8DCEF")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def crear_pdf_ot(numero):
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        eventos = [dict(r) for r in conn.execute("SELECT * FROM ot_eventos WHERE ot_numero = ? ORDER BY id", (numero,))]
    data = dict(ot)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.5 * cm, leftMargin=1.5 * cm, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    styles = getSampleStyleSheet()
    story = []
    logo = STATIC / "assets" / "logo-empresa.png"
    if logo.exists():
        story.append(Image(str(logo), width=4.2 * cm, height=2.0 * cm, kind="proportional"))
    story.extend([
        Paragraph("<b>ALIMENTOS CIELO S.A.C.</b>", styles["Title"]),
        Paragraph("MANTTO - ORDEN DE TRABAJO", styles["Heading2"]),
        Paragraph(f"<b>Numero:</b> {numero}", styles["Normal"]),
        Spacer(1, 0.3 * cm),
    ])
    sections = [
        ("Datos generales", [("Fecha creacion", data.get("creado_en")), ("Fecha intervencion", data.get("fecha_intervencion")), ("Fecha atencion", data.get("fecha_atencion")), ("Estado", data.get("estado")), ("Usuario creador", data.get("usuario")), ("Tecnico responsable", data.get("tecnico_1"))]),
        ("Datos del equipo", [("Sede", data.get("sede")), ("Ubicacion", data.get("ubicacion")), ("Proceso", data.get("proceso")), ("Sistema", data.get("sistema")), ("Equipo", data.get("equipo")), ("Sub-equipo", data.get("sub_equipo")), ("Componente", data.get("componente")), ("Tipo equipo", data.get("tipo_equipo")), ("Codigo", data.get("equipo_codigo"))]),
        ("Trabajo", [("Tipo falla", data.get("tipo_falla")), ("Tipo intervencion", data.get("tipo_intervencion")), ("Parada linea", data.get("parada_linea")), ("Descripcion", data.get("descripcion_trabajo")), ("Trabajo realizado", data.get("trabajo_realizado")), ("Observaciones", data.get("observaciones"))]),
    ]
    for title, rows_data in sections:
        story.append(Paragraph(f"<b>{title}</b>", styles["Heading3"]))
        story.append(pdf_table(rows_data))
        story.append(Spacer(1, 0.25 * cm))
    if eventos:
        story.append(Paragraph("<b>Eventos de OT</b>", styles["Heading3"]))
        story.append(pdf_table([(e["creado_en"], f"{e['evento']} - {e['estado']} - {e.get('usuario') or ''}") for e in eventos]))
        story.append(Spacer(1, 0.25 * cm))
    story.append(pdf_table([("Firma tecnico", "\n\n____________________________"), ("Firma supervisor", "\n\n____________________________")]))
    doc.build(story)
    return buffer.getvalue()


def assert_ot_scope_by_numero(numero, user):
    if is_admin_user(user):
        return
    with connect() as conn:
        ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (numero,)).fetchone()
        if not ot:
            raise HTTPException(status_code=404, detail="OT no encontrada")
        assert_row_sede(ot, user, "OT")


@app.get("/api/ots/{numero}/pdf")
def exportar_ot_pdf(numero: str, user=Depends(current_user)):
    assert_ot_scope_by_numero(numero, user)
    pdf = crear_pdf_ot(numero)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{numero}.pdf"'})


@app.get("/api/ots/exportar-pdf-masivo")
def exportar_ot_pdf_masivo(desde: Optional[str] = "", hasta: Optional[str] = "", estado: Optional[str] = "", tecnico: Optional[str] = "", sede: Optional[str] = "", equipo: Optional[str] = "", codigo: Optional[str] = "", numeros: Optional[str] = "", user=Depends(current_user)):
    ots = buscar_ots(desde, hasta, estado, tecnico, sede, equipo, numeros, codigo, user=user)
    if not ots:
        raise HTTPException(status_code=404, detail="No existen OT en el rango seleccionado")
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zip_file:
        for ot in ots:
            zip_file.writestr(f"{ot['numero']}.pdf", crear_pdf_ot(ot["numero"]))
    buffer.seek(0)
    nombre = f"OT_EXPORT_{desde or 'inicio'}_{hasta or 'fin'}.zip".replace("/", "-")
    return StreamingResponse(buffer, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


@app.get("/api/ots/exportar-excel")
def exportar_historial_ot_excel(desde: Optional[str] = "", hasta: Optional[str] = "", estado: Optional[str] = "", tecnico: Optional[str] = "", sede: Optional[str] = "", equipo: Optional[str] = "", codigo: Optional[str] = "", numero: Optional[str] = "", prioridad: Optional[str] = "", tipo_mantenimiento: Optional[str] = "", user=Depends(current_user)):
    ots = buscar_ots(desde, hasta, estado, tecnico, sede, equipo, numero or "", codigo, prioridad, tipo_mantenimiento, user=user)
    columnas = [
        ("numero", "Numero OT"), ("creado_en", "Fecha"), ("hora_inicio", "Hora"), ("aviso_numero", "Aviso origen"),
        ("ubicacion", "Area"), ("equipo", "Equipo"), ("proceso", "Ubicacion"), ("tipo_falla", "Prioridad"),
        ("tipo_intervencion", "Tipo de mantenimiento"), ("descripcion_trabajo", "Descripcion"), ("tecnico_1", "Personal asignado"),
        ("fecha_intervencion", "Fecha programada"), ("fecha_atencion", "Fecha de ejecucion"), ("fecha_atencion", "Fecha de cierre"),
        ("estado", "Estado"), ("hora_fin", "Tiempo de atencion"), ("repuestos_utilizados", "Repuestos utilizados"),
        ("observaciones", "Observaciones"), ("usuario", "Usuario que creo"), ("usuario_cierre", "Usuario que cerro"),
    ]
    data = [{label: ot.get(key, "") for key, label in columnas} for ot in ots]
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(data).to_excel(writer, sheet_name="Historial OT", index=False)
    buffer.seek(0)
    nombre = f"HISTORIAL_OT_{desde or 'inicio'}_{hasta or 'fin'}.xlsx".replace("/", "-")
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
