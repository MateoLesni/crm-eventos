"""
PDF del pre-check para mandarle al cliente.
Incluye datos del evento, lo contratado con sus observaciones, adicionales,
totales (IVA y propina discriminados), plan de pagos y, en hoja aparte,
las condiciones y políticas de pago que se cargan desde el catálogo.
"""
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.utils.timezone import ahora_argentina

COLOR_MARCA = colors.HexColor('#17382d')
COLOR_SUAVE = colors.HexColor('#ecede7')
COLOR_LINEA = colors.HexColor('#d5d7cf')
COLOR_TEXTO_2 = colors.HexColor('#5b625d')

DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
         'septiembre', 'octubre', 'noviembre', 'diciembre']
ESTADO_CUOTA = {'PAGADO': 'Pagado', 'PARCIAL': 'Pago parcial', 'PENDIENTE': 'Pendiente',
                'VENCIDO': 'Vencido', 'SIN_MONTO': '-'}


def pesos(valor):
    valor = float(valor or 0)
    signo = '-' if valor < 0 else ''
    return f"{signo}${abs(valor):,.0f}".replace(',', '.')


def cantidad(valor):
    valor = float(valor or 0)
    return f'{valor:g}'.replace('.', ',')


def fecha_larga(d):
    if not d:
        return '-'
    return f'{DIAS[d.weekday()].capitalize()} {d.day} de {MESES[d.month - 1]} de {d.year}'


def fecha_corta(iso):
    if not iso:
        return '-'
    d = date.fromisoformat(iso[:10])
    return d.strftime('%d/%m/%Y')


def _estilos():
    base = getSampleStyleSheet()
    return {
        'marca': ParagraphStyle('marca', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=18,
                                textColor=COLOR_MARCA, leading=22),
        'sub': ParagraphStyle('sub', parent=base['Normal'], fontSize=10, textColor=COLOR_TEXTO_2, leading=13),
        'seccion': ParagraphStyle('seccion', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=11,
                                  textColor=COLOR_MARCA, spaceBefore=14, spaceAfter=6),
        'celda': ParagraphStyle('celda', parent=base['Normal'], fontSize=8.5, leading=10.5),
        'obs': ParagraphStyle('obs', parent=base['Normal'], fontSize=7.5, leading=9.5, textColor=COLOR_TEXTO_2),
        'celda_der': ParagraphStyle('celda_der', parent=base['Normal'], fontSize=8.5, leading=10.5, alignment=TA_RIGHT),
        'texto': ParagraphStyle('texto', parent=base['Normal'], fontSize=9, leading=13, spaceAfter=5),
        'nota': ParagraphStyle('nota', parent=base['Normal'], fontSize=7.5, leading=10, textColor=COLOR_TEXTO_2),
    }


def _tabla(filas, anchos, totales=0):
    t = Table(filas, colWidths=anchos, repeatRows=1)
    estilo = [
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_MARCA),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEBELOW', (0, 1), (-1, -1 - totales), 0.4, COLOR_LINEA),
    ]
    if totales:
        estilo += [('FONTNAME', (0, -totales), (-1, -1), 'Helvetica-Bold'),
                   ('LINEABOVE', (0, -totales), (-1, -totales), 1, COLOR_MARCA)]
    t.setStyle(TableStyle(estilo))
    return t


def _descripcion(item, e):
    texto = f'<b>{escape(item["descripcion"])}</b>'
    if item.get('observaciones'):
        texto += f'<br/><font size="7.5" color="#5b625d">{escape(item["observaciones"]).replace(chr(10), "<br/>")}</font>'
    return Paragraph(texto, e['celda'])


def _categoria(item):
    return item.get('categoria_otro') or item.get('categoria') or '-'


def generar_pdf_precheck(evento, precheck, conceptos, adicionales, pagos, resumen, condiciones=''):
    """
    evento: instancia Evento; precheck: instancia Precheck o None.
    conceptos/adicionales/pagos: listas de dicts (to_dict()). resumen: calcular_resumen().
    """
    buffer = BytesIO()
    local = evento.local.nombre if evento.local else 'NG Eventos'
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1.8 * cm, leftMargin=1.8 * cm,
                            topMargin=1.6 * cm, bottomMargin=1.8 * cm,
                            title=f'Pre-check {local}', author='NG Eventos')
    e = _estilos()
    ancho = A4[0] - 3.6 * cm
    el = []

    # ---- Encabezado
    el.append(Paragraph(escape(local), e['marca']))
    el.append(Paragraph('Pre-check del evento', e['sub']))
    el.append(Spacer(1, 0.35 * cm))

    cliente = evento.cliente.nombre if evento.cliente else '-'
    horario = '-'
    if evento.horario_inicio:
        horario = evento.horario_inicio.strftime('%H:%M') + (f' a {evento.horario_fin.strftime("%H:%M")}' if evento.horario_fin else '') + ' h'
    espacio = local + (f' · {precheck.sector.nombre}' if precheck and precheck.sector else '')
    datos = [
        ['Cliente', cliente, 'Fecha', fecha_larga(evento.fecha_evento)],
        ['Razón social', (precheck.razon_social if precheck and precheck.razon_social else '-'), 'Horario', horario],
        ['Motivo', (precheck.motivo if precheck and precheck.motivo else '-'), 'Personas', str(evento.cantidad_personas or '-')],
        ['Espacio', espacio, 'Facturación', (f"Con factura (IVA {cantidad(resumen.get('iva_porcentaje', 21))}%)" if evento.facturada else 'Sin factura')],
    ]
    datos = [[Paragraph(f'<font color="#5b625d">{a}</font>', e['celda']), Paragraph(escape(str(b)), e['celda']),
              Paragraph(f'<font color="#5b625d">{c}</font>', e['celda']), Paragraph(escape(str(d)), e['celda'])]
             for a, b, c, d in datos]
    t = Table(datos, colWidths=[2.4 * cm, ancho / 2 - 2.4 * cm, 2.2 * cm, ancho / 2 - 2.2 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_SUAVE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    el.append(t)

    # ---- Lo contratado
    if conceptos:
        el.append(Paragraph('Lo contratado', e['seccion']))
        filas = [['Rubro', 'Detalle', 'Cant.', 'Precio unit.', 'Subtotal']]
        for c in conceptos:
            filas.append([Paragraph(escape(_categoria(c)), e['celda']), _descripcion(c, e),
                          Paragraph(cantidad(c['cantidad']), e['celda_der']),
                          Paragraph(pesos(c['precio_unitario']), e['celda_der']),
                          Paragraph(pesos(c['subtotal']), e['celda_der'])])
        filas.append(['', '', '', Paragraph('<b>Total</b>', e['celda_der']),
                      Paragraph(f"<b>{pesos(resumen['total_conceptos'])}</b>", e['celda_der'])])
        el.append(_tabla(filas, [3 * cm, ancho - 3 * cm - 1.4 * cm - 2.6 * cm - 2.8 * cm, 1.4 * cm, 2.6 * cm, 2.8 * cm], totales=1))

    # ---- Adicionales
    if adicionales:
        el.append(Paragraph('Adicionales del evento', e['seccion']))
        filas = [['Rubro', 'Detalle', 'Monto']]
        for a in adicionales:
            filas.append([Paragraph(escape(_categoria(a)), e['celda']), _descripcion(a, e),
                          Paragraph(pesos(a['monto']), e['celda_der'])])
        filas.append(['', Paragraph('<b>Total</b>', e['celda_der']),
                      Paragraph(f"<b>{pesos(resumen['total_adicionales'])}</b>", e['celda_der'])])
        el.append(_tabla(filas, [3 * cm, ancho - 3 * cm - 2.8 * cm, 2.8 * cm], totales=1))

    # ---- Totales
    filas = [['Subtotal', pesos(resumen['subtotal'])]]
    if resumen.get('iva'):
        filas.append([f"IVA {cantidad(resumen.get('iva_porcentaje', 21))}%", pesos(resumen['iva'])])
    if resumen.get('propina'):
        filas.append([f"Propina ({cantidad(resumen['propina_porcentaje'])}%)", pesos(resumen['propina'])])
    filas.append(['TOTAL', pesos(resumen['total'])])
    t = Table(filas, colWidths=[ancho - 4 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 11.5),
        ('TEXTCOLOR', (0, -1), (-1, -1), COLOR_MARCA),
        ('LINEABOVE', (0, -1), (-1, -1), 1.2, COLOR_MARCA),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    el.append(Spacer(1, 0.3 * cm))
    el.append(KeepTogether([t]))

    # ---- Plan de pagos
    plan = [c for c in resumen.get('plan_pagos', []) if c['monto']]
    if plan:
        bloque = [Paragraph('Plan de pagos', e['seccion'])]
        filas = [['Concepto', 'Vence', 'Monto', 'Pagado', 'Estado']]
        for c in plan:
            vence = fecha_corta(c['vence']) if c['vence'] else 'Al confirmar'
            filas.append([c['concepto'], vence, pesos(c['monto']), pesos(c['pagado']), ESTADO_CUOTA.get(c['estado'], c['estado'])])
        t = _tabla(filas, [ancho - 2.6 * cm * 3 - 2.4 * cm, 2.6 * cm, 2.6 * cm, 2.6 * cm, 2.4 * cm])
        t.setStyle(TableStyle([('ALIGN', (2, 1), (3, -1), 'RIGHT')]))
        bloque.append(t)
        bloque.append(Spacer(1, 0.15 * cm))
        bloque.append(Paragraph(
            f"Pagado a la fecha: <b>{pesos(resumen['total_pagado'])}</b> · Saldo: <b>{pesos(max(resumen['pendiente'], 0))}</b>",
            e['texto']))
        el.append(KeepTogether(bloque))

    # ---- Pagos recibidos (solo los confirmados por tesorería)
    validados = [p for p in pagos if p.get('estado') == 'VALIDADO']
    if validados:
        filas = [['Fecha', 'Medio de pago', 'Monto']]
        for p in validados:
            filas.append([fecha_corta(p.get('fecha_pago')), p.get('metodo_pago') or '-', pesos(p.get('monto'))])
        t = _tabla(filas, [3 * cm, ancho - 6 * cm, 3 * cm])
        t.setStyle(TableStyle([('ALIGN', (2, 1), (2, -1), 'RIGHT')]))
        el.append(KeepTogether([Paragraph('Pagos recibidos', e['seccion']), t]))

    el.append(Spacer(1, 0.4 * cm))
    el.append(Paragraph('Los valores pueden actualizarse según las condiciones de pago detalladas en el anexo. '
                        'Los adicionales que surjan durante el evento se suman al cierre.', e['nota']))

    # ---- Anexo de condiciones
    if (condiciones or '').strip():
        el.append(PageBreak())
        el.append(Paragraph('Condiciones y políticas de pago', e['marca']))
        el.append(Spacer(1, 0.3 * cm))
        for parrafo in condiciones.strip().split('\n'):
            if parrafo.strip():
                el.append(Paragraph(escape(parrafo.strip()), e['texto']))
            else:
                el.append(Spacer(1, 0.15 * cm))

    generado = ahora_argentina().strftime('%d/%m/%Y %H:%M')

    def pie(canvas, documento):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(COLOR_TEXTO_2)
        canvas.drawString(1.8 * cm, 1 * cm, f'{local} · Pre-check emitido el {generado}')
        canvas.drawRightString(A4[0] - 1.8 * cm, 1 * cm, f'Página {documento.page}')
        canvas.restoreState()

    doc.build(el, onFirstPage=pie, onLaterPages=pie)
    buffer.seek(0)
    return buffer
