# PEGAR EN servidor.py
#
# 1) Agrega estos imports junto con los imports de reportlab:
# from reportlab.pdfgen import canvas
#
# 2) Pega la ruta y funciones de este archivo debajo de exportar_ot_pdf_masivo(...)
#    o antes de @app.get("/api/peticiones").
#
# 3) No borres tu endpoint /api/ots/exportar-pdf-masivo. Esta ruta nueva es solo
#    para el boton Imprimir del historial de OT.


@app.get("/api/ots/imprimir-pdf")
def imprimir_ots_pdf(
    numeros: Optional[str] = "",
    desde: Optional[str] = "",
    hasta: Optional[str] = "",
    estado: Optional[str] = "",
    tecnico: Optional[str] = "",
    sede: Optional[str] = "",
    equipo: Optional[str] = "",
    codigo: Optional[str] = "",
    user=Depends(current_user),
):
    ots = buscar_ots(desde, hasta, estado, tecnico, sede, equipo, numeros or "", codigo)
    if not ots:
        raise HTTPException(status_code=404, detail="No existen OT para imprimir")

    pdf = crear_pdf_ots_dos_por_hoja(ots)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="OT_IMPRESION.pdf"'},
    )


def crear_pdf_ots_dos_por_hoja(ots):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin = 0.55 * cm
    gap = 0.35 * cm
    card_w = page_w - (2 * margin)
    card_h = (page_h - (2 * margin) - gap) / 2

    with connect() as conn:
        for index, ot_data in enumerate(ots):
            if index and index % 2 == 0:
                c.showPage()

            top_slot = index % 2 == 0
            x = margin
            y = page_h - margin - card_h if top_slot else margin
            ot = conn.execute("SELECT * FROM ots WHERE numero = ?", (ot_data["numero"],)).fetchone()
            if ot:
                eventos = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT * FROM ot_eventos WHERE ot_numero = ? ORDER BY id",
                        (ot_data["numero"],),
                    )
                ]
                cal = conn.execute(
                    "SELECT * FROM ot_calificaciones WHERE ot_numero = ?",
                    (ot_data["numero"],),
                ).fetchone()
                dibujar_formato_ot_compacto(c, x, y, card_w, card_h, dict(ot), eventos, dict(cal) if cal else None)

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


def dibujar_formato_ot_compacto(c, x, y, w, h, ot, eventos=None, calificacion=None):
    eventos = eventos or []
    line = colors.black
    blue = colors.HexColor("#0B64B0")
    light = colors.HexColor("#F3F7FC")

    def txt(value):
        return str(value or "").strip()

    def fecha(value):
        value = txt(value)
        return value[:10] if value else ""

    def hora(value):
        value = txt(value)
        return value[:5] if value else ""

    def cell(cx, cy, cw, ch, label="", value="", bold_label=True, align="left", fill=None, size=6.2):
        if fill:
            c.setFillColor(fill)
            c.rect(cx, cy, cw, ch, stroke=0, fill=1)
        c.setStrokeColor(line)
        c.rect(cx, cy, cw, ch, stroke=1, fill=0)
        c.setFillColor(colors.black)
        if label:
            c.setFont("Helvetica-Bold" if bold_label else "Helvetica", size)
            c.drawString(cx + 2, cy + ch - size - 2, str(label)[:32])
        if value is not None:
            c.setFont("Helvetica", size)
            text_y = cy + 3 if label else cy + (ch / 2) - 2
            value = str(value)
            if align == "center":
                c.drawCentredString(cx + cw / 2, text_y, value[:58])
            else:
                c.drawString(cx + 2, text_y, value[:70])

    def header_text(cx, cy, text, size=6.5):
        c.setFont("Helvetica-Bold", size)
        c.drawCentredString(cx, cy, text)

    def wrap_lines(text, max_chars, max_lines):
        words = txt(text).split()
        lines = []
        current = ""
        for word in words:
            if len(current) + len(word) + 1 <= max_chars:
                current = f"{current} {word}".strip()
            else:
                if current:
                    lines.append(current)
                current = word
            if len(lines) >= max_lines:
                break
        if current and len(lines) < max_lines:
            lines.append(current)
        return lines[:max_lines]

    c.setStrokeColor(line)
    c.setLineWidth(0.8)
    c.rect(x, y, w, h, stroke=1, fill=0)

    top = y + h
    left_w = 3.7 * cm
    right_w = 4.25 * cm
    header_h = 1.55 * cm
    logo = STATIC / "assets" / "logo-empresa.png"

    c.rect(x, top - header_h, left_w, header_h, stroke=1, fill=0)
    if logo.exists():
        try:
            c.drawImage(str(logo), x + 0.25 * cm, top - 1.05 * cm, width=2.2 * cm, height=0.8 * cm, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    c.setFont("Helvetica-Bold", 6.3)
    c.drawCentredString(x + left_w / 2, top - 1.25 * cm, "ALIMENTOS CIELO SAC")

    c.rect(x + left_w, top - header_h, w - left_w - right_w, header_h, stroke=1, fill=0)
    header_text(x + left_w + (w - left_w - right_w) / 2, top - 0.78 * cm, "ORDEN DE TRABAJO MANTENIMIENTO GENERAL", 7.6)

    meta_x = x + w - right_w
    row_h = header_h / 4
    cell(meta_x, top - row_h, right_w, row_h, "Version:", "1", size=6)
    cell(meta_x, top - row_h * 2, right_w, row_h, "Revision:", "01", size=6)
    cell(meta_x, top - row_h * 3, right_w, row_h, "Fecha:", "Mayo 2024", size=6)
    cell(meta_x, top - row_h * 4, right_w, row_h, "Cod.:", "ALIC-MTTO-F-02", size=6)

    cy = top - header_h
    rh = 0.36 * cm
    c.setFillColor(light)
    c.rect(x, cy - rh, w, rh, stroke=1, fill=1)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x + 2, cy - rh + 3, "ESTADO DE OT:")
    c.drawString(x + 4.25 * cm, cy - rh + 3, txt(ot.get("estado")) or "ABIERTA")

    cy -= rh
    cell(x, cy - rh, w * 0.24, rh, "ORDEN DE TRABAJO:", txt(ot.get("numero")), size=6)
    cell(x + w * 0.24, cy - rh, w * 0.24, rh, "FECHA:", fecha(ot.get("creado_en") or ot.get("fecha_intervencion")), size=6)
    cell(x + w * 0.48, cy - rh, w * 0.22, rh, "TIPO:", txt(ot.get("tipo_servicio")), size=6)
    cell(x + w * 0.70, cy - rh, w * 0.30, rh, "SOLICITUD N:", txt(ot.get("aviso_numero")) or "MTTO", size=6)

    cy -= rh
    cell(x, cy - rh, w * 0.46, rh, "AREA:", txt(ot.get("ubicacion") or ot.get("sede")), size=6)
    cell(x + w * 0.46, cy - rh, w * 0.18, rh, "PARADA:", txt(ot.get("parada_linea")), size=6)
    cell(x + w * 0.64, cy - rh, w * 0.36, rh, "EQUIPO:", txt(ot.get("equipo") or ot.get("equipo_codigo")), size=6)

    cy -= rh
    cell(x, cy - rh, w * 0.46, rh, "LINEA:", txt(ot.get("sistema") or ot.get("proceso")), size=6)
    cell(x + w * 0.46, cy - rh, w * 0.54, rh, "TIPO DE INTERVENCION:", txt(ot.get("tipo_intervencion") or ot.get("tipo_falla")), size=6)

    cy -= rh
    columns = [0.46, 0.11, 0.11, 0.15, 0.17]
    headers = ["TECNICO MANTENIMIENTO", "H. INICIO", "H. TERMINO", "T. PARCIAL", "FECHA"]
    cx = x
    for frac, head in zip(columns, headers):
        cell(cx, cy - rh, w * frac, rh, head, "", size=5.8, fill=light)
        cx += w * frac

    tecnico_rows = [
        (txt(ot.get("tecnico_1")), hora(ot.get("hora_inicio")), hora(ot.get("hora_fin")), "", fecha(ot.get("fecha_intervencion") or ot.get("fecha_atencion"))),
        (txt(ot.get("tecnico_2")), "", "", "", ""),
    ]
    for tecnico in tecnico_rows:
        cy -= rh
        cx = x
        for frac, value in zip(columns, tecnico):
            cell(cx, cy - rh, w * frac, rh, "", value, align="center", size=6)
            cx += w * frac

    cy -= rh
    desc_h = 0.95 * cm
    cell(x, cy - desc_h, w, desc_h, "DESCRIPCION CAUSA DE LA FALLA", "", size=6, fill=light)
    c.setFont("Helvetica", 6.2)
    for i, line_text in enumerate(wrap_lines(ot.get("descripcion_trabajo") or ot.get("tipo_falla"), 125, 3)):
        c.drawCentredString(x + w / 2, cy - 0.36 * cm - (i * 8), line_text)

    cy -= desc_h
    work_h = 1.25 * cm
    cell(x, cy - work_h, w, work_h, "DESCRIPCION DEL TRABAJO DE MANTENIMIENTO", "", size=6, fill=light)
    trabajo = txt(ot.get("trabajo_realizado") or ot.get("observaciones") or "")
    for i, line_text in enumerate(wrap_lines(trabajo, 125, 4)):
        c.drawCentredString(x + w / 2, cy - 0.38 * cm - (i * 8), line_text)

    cy -= work_h
    obs_h = 0.48 * cm
    cell(x, cy - obs_h, w, obs_h, "OBSERVACION", txt(ot.get("observaciones")), size=5.8)

    cy -= obs_h
    score_h = 0.56 * cm
    cell(x, cy - score_h, w, score_h, "CALIDAD DEL SERVICIO", "", size=6, fill=light)
    score_y = cy - score_h + 0.14 * cm
    box_w = 0.42 * cm
    for n in range(1, 11):
        bx = x + 1.25 * cm + (n - 1) * ((w - 2.5 * cm) / 10)
        c.rect(bx, score_y, box_w, 0.24 * cm, stroke=1, fill=0)
        c.setFont("Helvetica", 5.8)
        c.drawCentredString(bx + box_w / 2, score_y + 2.5, str(n))
    if calificacion:
        promedio = calificacion.get("promedio") or calificacion.get("calificacion") or ""
        c.setFont("Helvetica-Bold", 6)
        c.drawRightString(x + w - 4, score_y + 2.5, f"Prom: {promedio}/5")

    cy -= score_h
    firm_h = max(0.58 * cm, cy - y)
    third = w / 3
    firmas = [
        ("Supervisor Mecanico", txt(ot.get("tecnico_1"))),
        ("Jefe de Area", ""),
        ("Jefe de Mantenimiento", ""),
    ]
    for idx, (cargo, nombre) in enumerate(firmas):
        fx = x + idx * third
        c.line(fx + 0.35 * cm, y + 0.28 * cm, fx + third - 0.35 * cm, y + 0.28 * cm)
        c.setFont("Helvetica", 5.8)
        c.drawCentredString(fx + third / 2, y + 0.14 * cm, cargo)
        if nombre:
            c.drawCentredString(fx + third / 2, y + 0.39 * cm, nombre[:38])
