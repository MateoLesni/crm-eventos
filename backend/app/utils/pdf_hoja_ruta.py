"""
PDF de la hoja de ruta para el local y cocina (sin precios).
Mismo esqueleto que las HDR que arman hoy: cabecera, menú, bebidas, servicios,
técnica, armado con planos, observaciones y timing por día.
"""
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.utils.hoja_ruta import DIAS_TIMING, cantidad_por_pax
from app.utils.timezone import ahora_argentina

MARCA = colors.HexColor('#17382d')
SUAVE = colors.HexColor('#ecede7')
LINEA = colors.HexColor('#d5d7cf')
GRIS = colors.HexColor('#5b625d')
DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


def _p(texto, estilo):
    return Paragraph(escape(str(texto or '')).replace('\n', '<br/>'), estilo)


def _si_no(v):
    return 'SÍ' if v is True else 'NO' if v is False else '—'


def _descargar(blob_path):
    try:
        from app.utils.storage import GCP_BUCKET_NAME, get_storage_client
        return get_storage_client().bucket(GCP_BUCKET_NAME).blob(blob_path).download_as_bytes()
    except Exception as e:  # noqa: BLE001
        print(f'No se pudo bajar el plano {blob_path}: {e}')
        return None


def generar_pdf_hoja_ruta(evento, cab, hdr, planos, hoja, ultima_version, descargar=None):
    descargar = descargar or _descargar
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.5 * cm,
                            bottomMargin=1.6 * cm, title=f"Hoja de ruta {cab['local']}", author='NG Eventos')
    ancho = A4[0] - 3.2 * cm
    base = getSampleStyleSheet()
    e = {
        'titulo': ParagraphStyle('t', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=16, textColor=MARCA, leading=20),
        'sub': ParagraphStyle('s', parent=base['Normal'], fontSize=9, textColor=GRIS),
        'sec': ParagraphStyle('sec', parent=base['Normal'], fontName='Helvetica-Bold', fontSize=10.5, textColor=MARCA,
                              spaceBefore=12, spaceAfter=4),
        'c': ParagraphStyle('c', parent=base['Normal'], fontSize=8.5, leading=10.5),
        'cb': ParagraphStyle('cb', parent=base['Normal'], fontSize=8.5, leading=10.5, fontName='Helvetica-Bold'),
        'txt': ParagraphStyle('txt', parent=base['Normal'], fontSize=9, leading=12.5),
        'alerta': ParagraphStyle('al', parent=base['Normal'], fontSize=9.5, leading=12.5, fontName='Helvetica-Bold',
                                 textColor=colors.HexColor('#8c2443')),
    }
    el = []

    def tabla(filas, anchos, cabecera=True, grilla=True):
        t = Table(filas, colWidths=anchos, repeatRows=1 if cabecera else 0)
        estilo = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 3),
                  ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
        if grilla:
            estilo.append(('LINEBELOW', (0, 0), (-1, -1), 0.4, LINEA))
        if cabecera:
            estilo += [('BACKGROUND', (0, 0), (-1, 0), SUAVE)]
        t.setStyle(TableStyle(estilo))
        return t

    # ---- Cabecera
    el.append(_p(f"Hoja de ruta {cab['local']}", e['titulo']))
    if ultima_version:
        estado = f'Versión {ultima_version.version} · enviada el {ultima_version.created_at:%d/%m/%Y %H:%M}'
        if ultima_version.enviada_por:
            estado += f' por {ultima_version.enviada_por.nombre}'
        if hoja and hoja.cambios_sin_enviar:
            estado += ' · OJO: tiene cambios posteriores sin enviar'
    else:
        estado = 'Borrador: todavía no se envió al local'
    el.append(_p(estado, e['sub']))
    el.append(Spacer(1, 0.25 * cm))
    fecha = '-'
    if cab.get('fecha_evento'):
        d = date.fromisoformat(cab['fecha_evento'])
        fecha = f'{DIAS[d.weekday()].capitalize()} {d.day} de {MESES[d.month - 1]}'
    datos = [
        ['Cliente', cab['cliente'], 'Fecha', fecha],
        ['Motivo', cab['motivo'] or '-', 'Horario', cab['horario'] or '-'],
        ['Personas', str(cab['pax'] or '-'), 'Espacio', cab['espacio'] or '-'],
    ]
    t = Table([[_p(a, e['sub']), _p(b, e['cb']), _p(c, e['sub']), _p(d2, e['cb'])] for a, b, c, d2 in datos],
              colWidths=[2.1 * cm, ancho / 2 - 2.1 * cm, 2.1 * cm, ancho / 2 - 2.1 * cm])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), SUAVE), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    el.append(t)
    pax = cab.get('pax')

    # ---- Menú
    if hdr.get('restricciones') or hdr.get('menu'):
        el.append(_p('Menú', e['sec']))
        if hdr.get('restricciones'):
            el.append(_p(f"Restricciones alimentarias: {hdr['restricciones']}", e['alerta']))
            el.append(Spacer(1, 0.1 * cm))
        for bloque in hdr.get('menu') or []:
            filas = [[_p(bloque.get('titulo') or 'Menú', e['cb']), _p('Por pax', e['cb']), _p('Cantidad', e['cb'])]]
            for it in bloque.get('items') or []:
                cant = it.get('cantidad') or cantidad_por_pax(it.get('por_pax'), pax)
                filas.append([_p(it.get('nombre'), e['c']), _p(it.get('por_pax') or '', e['c']), _p(cant if cant is not None else '', e['c'])])
            if len(filas) == 1:
                filas.append([_p('(sin detalle cargado)', e['sub']), '', ''])
            el.append(tabla(filas, [ancho - 5.6 * cm, 2.8 * cm, 2.8 * cm]))
            el.append(Spacer(1, 0.15 * cm))

    # ---- Bebidas
    b = hdr.get('bebidas') or {}
    filas_beb = []
    if b.get('sin_alcohol'):
        filas_beb.append([_p('Sin alcohol', e['cb']), _p(b['sin_alcohol'], e['c'])])
    if b.get('barra_modalidad'):
        filas_beb.append([_p('Barra', e['cb']), _p(b['barra_modalidad'], e['c'])])
    for clave, nombre in (('vinos', 'Vinos'), ('espumante', 'Espumante')):
        v = b.get(clave) or {}
        if v.get('incluye') is not None or v.get('detalle'):
            filas_beb.append([_p(nombre, e['cb']), _p(f"{_si_no(v.get('incluye'))}  {v.get('detalle') or ''}", e['c'])])
    if filas_beb or b.get('tragos'):
        el.append(_p('Bebidas', e['sec']))
        if filas_beb:
            el.append(tabla(filas_beb, [3.2 * cm, ancho - 3.2 * cm], cabecera=False))
        if b.get('tragos'):
            filas = [[_p('Tragos', e['cb']), _p('Detalle', e['cb'])]]
            filas += [[_p(x['nombre'], e['c']), _p(x.get('detalle'), e['c'])] for x in b['tragos']]
            el.append(Spacer(1, 0.15 * cm))
            el.append(tabla(filas, [6 * cm, ancho - 6 * cm]))
        if b.get('nota_barra'):
            el.append(Spacer(1, 0.1 * cm))
            el.append(_p(f"IMPORTANTE: {b['nota_barra']}", e['alerta']))

    # ---- Servicios
    servicios = [s for s in hdr.get('servicios') or [] if s.get('incluye') is not None or s.get('detalle')]
    if servicios:
        el.append(_p('Servicios', e['sec']))
        filas = [[_p(s['nombre'], e['cb']), _p(_si_no(s.get('incluye')), e['c']), _p(s.get('detalle'), e['c'])] for s in servicios]
        el.append(tabla(filas, [4.2 * cm, 1.4 * cm, ancho - 5.6 * cm], cabecera=False))

    for clave, nombre in (('tecnica', 'Técnica'), ('armado', 'Armado / desarme')):
        if hdr.get(clave):
            el.append(_p(nombre, e['sec']))
            el.append(_p(hdr[clave], e['txt']))

    # ---- Planos
    imagenes = []
    titulo_planos = _p('Planos', e['sec'])
    for plano in planos or []:
        datos_img = descargar(plano.blob_path)
        if not datos_img:
            continue
        try:
            lector = ImageReader(BytesIO(datos_img))
            w, h = lector.getSize()
            escala = min(ancho / w, (A4[1] * 0.55) / h)
            bloque = [_p(plano.nombre_original, e['sub']), Image(BytesIO(datos_img), width=w * escala, height=h * escala)]
            if not imagenes:
                bloque.insert(0, titulo_planos)  # el título no queda solo al pie de una página
            imagenes.append(KeepTogether(bloque))
        except Exception as ex:  # noqa: BLE001
            print(f'Plano ilegible {plano.blob_path}: {ex}')
    if imagenes:
        for img in imagenes:
            el.append(img)
            el.append(Spacer(1, 0.2 * cm))

    if hdr.get('observaciones'):
        el.append(_p('Observaciones', e['sec']))
        el.append(_p(hdr['observaciones'], e['txt']))
    for sc in hdr.get('secciones') or []:
        el.append(_p(sc.get('titulo') or 'Otros', e['sec']))
        el.append(_p(sc.get('texto'), e['txt']))

    # ---- Timing por día
    if hdr.get('timing'):
        el.append(_p('Timing', e['sec']))
        for dia, nombre in DIAS_TIMING.items():
            filas_dia = [t for t in hdr['timing'] if t['dia'] == dia]
            if not filas_dia:
                continue
            filas = [[_p(nombre.upper(), e['cb'])]]
            for t in filas_dia:
                texto = f"<b>{escape(t.get('titulo') or '')}</b>"
                if t.get('detalle'):
                    texto += '<br/>' + escape(t['detalle']).replace('\n', '<br/>')
                filas.append([_p(t.get('hora'), e['cb']), Paragraph(texto, e['c'])])
            filas[0].append('')
            t = tabla(filas, [2 * cm, ancho - 2 * cm])
            t.setStyle(TableStyle([('SPAN', (0, 0), (1, 0))]))
            el.append(t)
            el.append(Spacer(1, 0.15 * cm))

    generado = ahora_argentina().strftime('%d/%m/%Y %H:%M')

    def pie(canvas, documento):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(GRIS)
        canvas.drawString(1.6 * cm, 1 * cm, f"{cab['local']} · {cab['cliente']} · impresa el {generado}")
        canvas.drawRightString(A4[0] - 1.6 * cm, 1 * cm, f'Página {documento.page}')
        canvas.restoreState()

    doc.build(el, onFirstPage=pie, onLaterPages=pie)
    buffer.seek(0)
    return buffer
