"""
Generador de PDF para Pre-Check
Crea un documento PDF elegante con el detalle del pre-check de un evento
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from io import BytesIO
from datetime import datetime
from app.utils.timezone import ahora_argentina

# Branding por local (texto por ahora, luego puede ser logo)
BRANDING_LOCAL = {
    1: {'nombre': 'Costa 7070', 'color': '#1a5276'},
    2: {'nombre': 'Kona', 'color': '#2e7d32'},
    3: {'nombre': 'MilVidas', 'color': '#6a1b9a'},
    4: {'nombre': 'CoChinChina', 'color': '#c62828'},
    5: {'nombre': 'Cruza Polo', 'color': '#00695c'},
    6: {'nombre': 'Cruza Recoleta', 'color': '#4527a0'},
}


def hex_to_rgb(hex_color):
    """Convierte color hex a RGB para reportlab"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16)/255 for i in (0, 2, 4))


def generar_pdf_precheck(evento, conceptos, adicionales, pagos, resumen):
    """
    Genera un PDF con el pre-check del evento

    Args:
        evento: dict con datos del evento
        conceptos: lista de conceptos
        adicionales: lista de adicionales
        pagos: lista de pagos
        resumen: dict con totales

    Returns:
        BytesIO con el PDF generado
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )

    # Obtener branding del local
    local_id = evento.get('local', {}).get('id', 1) if evento.get('local') else 1
    branding = BRANDING_LOCAL.get(local_id, BRANDING_LOCAL[1])
    brand_color = colors.Color(*hex_to_rgb(branding['color']))

    # Estilos
    styles = getSampleStyleSheet()

    style_titulo = ParagraphStyle(
        'Titulo',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=brand_color,
        spaceAfter=12,
        alignment=TA_CENTER
    )

    style_subtitulo = ParagraphStyle(
        'Subtitulo',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.gray,
        spaceAfter=6,
        alignment=TA_CENTER
    )

    style_seccion = ParagraphStyle(
        'Seccion',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=brand_color,
        spaceBefore=20,
        spaceAfter=10
    )

    style_normal = ParagraphStyle(
        'Normal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6
    )

    style_footer = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.gray,
        alignment=TA_CENTER
    )

    # Contenido del PDF
    elements = []

    # Header con branding
    elements.append(Paragraph(branding['nombre'], style_titulo))
    elements.append(Paragraph('Pre-Check de Evento', style_subtitulo))
    elements.append(Spacer(1, 0.5*cm))

    # Datos del evento
    elements.append(Paragraph('Datos del Evento', style_seccion))

    evento_data = [
        ['Cliente:', evento.get('cliente', {}).get('nombre', '-')],
        ['Evento:', evento.get('titulo_display', evento.get('titulo', '-'))],
        ['Fecha:', evento.get('fecha_evento', '-')],
        ['Personas:', str(evento.get('cantidad_personas', '-'))],
        ['Local:', evento.get('local', {}).get('nombre', '-') if evento.get('local') else '-'],
    ]

    tabla_evento = Table(evento_data, colWidths=[4*cm, 12*cm])
    tabla_evento.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.gray),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(tabla_evento)
    elements.append(Spacer(1, 0.5*cm))

    # Conceptos
    if conceptos:
        elements.append(Paragraph('Conceptos', style_seccion))

        conceptos_header = [['Categoria', 'Descripcion', 'Cant.', 'P. Unit.', 'Subtotal']]
        conceptos_rows = []

        for c in conceptos:
            cat = c.get('categoria_otro') or c.get('categoria', '-')
            desc = c.get('descripcion', '-')
            cant = str(c.get('cantidad', 0))
            precio = f"${c.get('precio_unitario', 0):,.2f}"
            subtotal = f"${c.get('subtotal', 0):,.2f}"
            conceptos_rows.append([cat, desc, cant, precio, subtotal])

        # Total conceptos
        conceptos_rows.append(['', '', '', 'Total:', f"${resumen.get('total_conceptos', 0):,.2f}"])

        tabla_conceptos = Table(conceptos_header + conceptos_rows,
                                colWidths=[3*cm, 6.5*cm, 1.5*cm, 2.5*cm, 2.5*cm])
        tabla_conceptos.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), brand_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            # Body
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.lightgrey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            # Footer row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1, brand_color),
        ]))
        elements.append(tabla_conceptos)

    # Adicionales
    if adicionales:
        elements.append(Paragraph('Adicionales', style_seccion))

        adicionales_header = [['Categoria', 'Descripcion', 'Monto']]
        adicionales_rows = []

        for a in adicionales:
            cat = a.get('categoria_otro') or a.get('categoria', '-')
            desc = a.get('descripcion', '-')
            monto = f"${a.get('monto', 0):,.2f}"
            adicionales_rows.append([cat, desc, monto])

        # Total adicionales
        adicionales_rows.append(['', 'Total:', f"${resumen.get('total_adicionales', 0):,.2f}"])

        tabla_adicionales = Table(adicionales_header + adicionales_rows,
                                  colWidths=[3*cm, 10.5*cm, 2.5*cm])
        tabla_adicionales.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), brand_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.lightgrey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1, brand_color),
        ]))
        elements.append(tabla_adicionales)

    # Resumen de totales
    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph('Resumen', style_seccion))

    totales_data = [
        ['Subtotal:', f"${resumen.get('subtotal', 0):,.2f}"],
    ]

    if resumen.get('iva', 0) > 0:
        totales_data.append(['IVA (21%):', f"${resumen.get('iva', 0):,.2f}"])

    totales_data.append(['TOTAL:', f"${resumen.get('total', 0):,.2f}"])

    if pagos:
        totales_data.append(['Pagado:', f"${resumen.get('total_pagado', 0):,.2f}"])
        pendiente = resumen.get('pendiente', 0)
        if pendiente > 0:
            totales_data.append(['PENDIENTE:', f"${pendiente:,.2f}"])
        else:
            totales_data.append(['SALDADO:', '$0.00'])

    tabla_totales = Table(totales_data, colWidths=[12*cm, 4*cm])
    tabla_totales.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, -3), (-1, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, -3), (-1, -3), 2, brand_color),
    ]))
    elements.append(tabla_totales)

    # Pagos
    if pagos:
        elements.append(Spacer(1, 0.5*cm))
        elements.append(Paragraph('Detalle de Pagos', style_seccion))

        pagos_header = [['Fecha', 'Metodo', 'Monto', 'Notas']]
        pagos_rows = []

        for p in pagos:
            fecha = p.get('fecha_pago', '-')
            metodo = p.get('metodo_pago', '-')
            monto = f"${p.get('monto', 0):,.2f}"
            notas = p.get('notas', '-') or '-'
            pagos_rows.append([fecha, metodo, monto, notas[:30]])

        tabla_pagos = Table(pagos_header + pagos_rows,
                           colWidths=[3*cm, 3*cm, 3*cm, 7*cm])
        tabla_pagos.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (2, 1), (2, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(tabla_pagos)

    # Footer
    elements.append(Spacer(1, 1.5*cm))
    fecha_generacion = ahora_argentina().strftime('%d/%m/%Y %H:%M')
    elements.append(Paragraph(
        f'Documento generado el {fecha_generacion} | {branding["nombre"]} - CRM Eventos',
        style_footer
    ))

    # Generar PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
