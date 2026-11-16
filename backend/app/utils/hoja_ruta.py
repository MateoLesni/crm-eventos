"""
Contenido de la hoja de ruta (HDR): estructura, limpieza, precarga desde el pre-check,
cantidades por pax y resumen de cambios entre versiones.

Estructura (JSON guardado en hojas_ruta.contenido), basada en las HDR reales de Costa y Cruza:
{
  "restricciones": "10 celíacos, 4 veggie",
  "menu": [{"titulo": "Bocados", "items": [{"nombre": "Pincho de pollo", "por_pax": "1", "cantidad": ""}]}],
  "bebidas": {
    "sin_alcohol": "Agua con/sin gas y gaseosas",
    "barra_modalidad": "Libre",
    "tragos": [{"nombre": "Negroni del Polo", "detalle": "Gin de limones, vermouth rojo..."}],
    "nota_barra": "Imprimir carta para los bartenders",
    "vinos": {"incluye": true, "detalle": "Zuccardi Q Malbec/Chardonnay"},
    "espumante": {"incluye": false, "detalle": ""}
  },
  "servicios": [{"nombre": "Seguridad", "incluye": true, "detalle": "11"}],
  "tecnica": "Tarima 2x1, 2 tótem LED (Colo Equipos). 16 h arman técnica",
  "armado": "Primer piso: livings con 2 mesas...",
  "timing": [{"dia": "evento", "hora": "19:00", "titulo": "Llegada de invitados", "detalle": ""}],
  "observaciones": "...",
  "secciones": [{"titulo": "Sustentabilidad", "texto": "Sin látex..."}]
}
"""
import json
import re
from fractions import Fraction

SERVICIOS_BASE = ['Seguridad', 'Valet parking', 'DJ', 'Ubicación cabina DJ', 'VJ', 'Guardia técnica', 'Fotografía / video']

DIAS_TIMING = {'anterior': 'Día anterior', 'evento': 'Día del evento', 'posterior': 'Día después'}

NOMBRES_SECCION = {
    'restricciones': 'Restricciones alimentarias',
    'menu': 'Menú',
    'bebidas': 'Bebidas',
    'servicios': 'Servicios',
    'tecnica': 'Técnica',
    'armado': 'Armado / desarme',
    'timing': 'Timing',
    'observaciones': 'Observaciones',
    'secciones': 'Otras secciones',
}


def vacio():
    return {
        'restricciones': '',
        'menu': [],
        'bebidas': {
            'sin_alcohol': 'Agua con/sin gas y gaseosas',
            'barra_modalidad': '',
            'tragos': [],
            'nota_barra': '',
            'vinos': {'incluye': None, 'detalle': ''},
            'espumante': {'incluye': None, 'detalle': ''},
        },
        'servicios': [{'nombre': n, 'incluye': None, 'detalle': ''} for n in SERVICIOS_BASE],
        'tecnica': '',
        'armado': '',
        'timing': [],
        'observaciones': '',
        'secciones': [],
    }


def _txt(valor, largo=5000):
    return (str(valor) if valor is not None else '').strip()[:largo]


def _si_no(valor):
    if valor in (True, 'true', 'si', 'SI', 'sí', 1):
        return True
    if valor in (False, 'false', 'no', 'NO', 0):
        return False
    return None


def normalizar(datos):
    """Limpia lo que manda el frontend: tipos correctos, largos máximos y nada vacío de más."""
    if not isinstance(datos, dict):
        raise ValueError('Contenido inválido')
    base = vacio()
    base['restricciones'] = _txt(datos.get('restricciones'), 2000)

    menu = []
    for b in (datos.get('menu') or [])[:40]:
        if not isinstance(b, dict):
            continue
        items = []
        for it in (b.get('items') or [])[:150]:
            if isinstance(it, dict) and _txt(it.get('nombre')):
                items.append({'nombre': _txt(it.get('nombre'), 300), 'por_pax': _txt(it.get('por_pax'), 30),
                              'cantidad': _txt(it.get('cantidad'), 30)})
        titulo = _txt(b.get('titulo'), 120)
        if titulo or items:
            menu.append({'titulo': titulo, 'items': items})
    base['menu'] = menu

    beb = datos.get('bebidas') or {}
    if isinstance(beb, dict):
        b = base['bebidas']
        b['sin_alcohol'] = _txt(beb.get('sin_alcohol'), 300)
        b['barra_modalidad'] = _txt(beb.get('barra_modalidad'), 200)
        b['nota_barra'] = _txt(beb.get('nota_barra'), 3000)
        b['tragos'] = [{'nombre': _txt(t.get('nombre'), 200), 'detalle': _txt(t.get('detalle'), 500)}
                       for t in (beb.get('tragos') or [])[:80] if isinstance(t, dict) and _txt(t.get('nombre'))]
        for clave in ('vinos', 'espumante'):
            v = beb.get(clave) or {}
            if isinstance(v, dict):
                b[clave] = {'incluye': _si_no(v.get('incluye')), 'detalle': _txt(v.get('detalle'), 300)}

    servicios = []
    for sv in (datos.get('servicios') or [])[:40]:
        if isinstance(sv, dict) and _txt(sv.get('nombre')):
            servicios.append({'nombre': _txt(sv.get('nombre'), 100), 'incluye': _si_no(sv.get('incluye')),
                              'detalle': _txt(sv.get('detalle'), 300)})
    base['servicios'] = servicios

    for clave in ('tecnica', 'armado', 'observaciones'):
        base[clave] = _txt(datos.get(clave), 8000)

    timing = []
    for t in (datos.get('timing') or [])[:120]:
        if isinstance(t, dict) and (_txt(t.get('titulo')) or _txt(t.get('detalle'))):
            dia = t.get('dia') if t.get('dia') in DIAS_TIMING else 'evento'
            timing.append({'dia': dia, 'hora': _txt(t.get('hora'), 20), 'titulo': _txt(t.get('titulo'), 200),
                           'detalle': _txt(t.get('detalle'), 1500)})
    orden_dia = {'anterior': 0, 'evento': 1, 'posterior': 2}
    timing.sort(key=lambda t: (orden_dia[t['dia']], _clave_hora(t['hora'])))
    base['timing'] = timing

    base['secciones'] = [{'titulo': _txt(sc.get('titulo'), 120), 'texto': _txt(sc.get('texto'), 8000)}
                         for sc in (datos.get('secciones') or [])[:20]
                         if isinstance(sc, dict) and (_txt(sc.get('titulo')) or _txt(sc.get('texto')))]
    return base


def _clave_hora(hora):
    m = re.match(r'^\s*(\d{1,2})[:.h]?(\d{2})?', hora or '')
    if not m:
        return (99, 99)
    return (int(m.group(1)), int(m.group(2) or 0))


def cantidad_por_pax(por_pax, pax):
    """
    "1" -> pax, "2" -> 2*pax, "0.5" -> pax/2, "1 cada 2" -> pax/2, "1/2" -> pax/2.
    Devuelve un entero (redondeado hacia arriba) o None si no se puede interpretar.
    """
    if not por_pax or not pax:
        return None
    texto = str(por_pax).strip().lower().replace(',', '.')
    try:
        m = re.match(r'^(\d+(?:\.\d+)?)\s*(?:cada|c/)\s*(\d+)$', texto)
        if m:
            factor = Fraction(m.group(1)) / Fraction(m.group(2))
        elif re.match(r'^\d+\s*/\s*\d+$', texto):
            factor = Fraction(texto.replace(' ', ''))
        elif re.match(r'^\d+(\.\d+)?$', texto):
            factor = Fraction(texto)
        else:
            return None
    except (ValueError, ZeroDivisionError):
        return None
    total = factor * int(pax)
    return int(-(-total.numerator // total.denominator))


def cargar(texto):
    try:
        datos = json.loads(texto) if texto else {}
    except (ValueError, TypeError):
        datos = {}
    try:
        return normalizar(datos) if datos else vacio()
    except ValueError:
        return vacio()


def sugerido_desde_precheck(evento):
    """Arma una HDR inicial con lo que ya está en el pre-check (menú del catálogo, vinos, DJ, técnica)."""
    hdr = vacio()
    conceptos = list(evento.precheck_conceptos)

    def detalle(c):
        partes = [c.descripcion]
        if c.observaciones:
            partes.append(c.observaciones)
        return ' · '.join(partes)

    for c in conceptos:
        if c.es_ajuste_ipc:
            continue
        cat = c.categoria
        item = None
        if c.catalogo_item_id:
            from app.models_precheck import CatalogoItem
            from app import db
            item = db.session.get(CatalogoItem, c.catalogo_item_id)
        if cat in ('Menú', 'Gastronomía'):
            bloques = item.composicion_lista if item else []
            if bloques:
                for b in bloques:
                    hdr['menu'].append({'titulo': b.get('titulo') or c.descripcion,
                                        'items': [{'nombre': i.get('nombre'), 'por_pax': i.get('por_pax') or '', 'cantidad': ''}
                                                  for i in b.get('items') or []]})
            else:
                hdr['menu'].append({'titulo': c.descripcion, 'items': []})
        elif cat == 'Barra':
            b = hdr['bebidas']
            b['barra_modalidad'] = (b['barra_modalidad'] + ' / ' if b['barra_modalidad'] else '') + detalle(c)
            if item and item.composicion_lista:
                for bloque in item.composicion_lista:
                    for i in bloque.get('items') or []:
                        b['tragos'].append({'nombre': i.get('nombre'), 'detalle': ''})
        elif cat in ('Vinos', 'Espumante'):
            clave = 'vinos' if cat == 'Vinos' else 'espumante'
            hdr['bebidas'][clave] = {'incluye': (c.condicion or 'cobrado') != 'no_incluido', 'detalle': detalle(c)}
        elif cat == 'DJ / Setup':
            _servicio(hdr, 'DJ', (c.condicion or 'cobrado') != 'no_incluido', detalle(c))
        elif cat == 'Valet / Estacionamiento':
            _servicio(hdr, 'Valet parking', (c.condicion or 'cobrado') != 'no_incluido', detalle(c))
        elif cat == 'Técnica':
            hdr['tecnica'] = (hdr['tecnica'] + '\n' if hdr['tecnica'] else '') + detalle(c)
        elif cat == 'Día de armado':
            hdr['armado'] = (hdr['armado'] + '\n' if hdr['armado'] else '') + detalle(c)
    return hdr


def _servicio(hdr, nombre, incluye, detalle):
    for sv in hdr['servicios']:
        if sv['nombre'] == nombre:
            sv['incluye'] = incluye
            sv['detalle'] = detalle
            return
    hdr['servicios'].append({'nombre': nombre, 'incluye': incluye, 'detalle': detalle})


def cabecera(evento):
    """Datos de arriba de la HDR (los mismos que el pre-check)."""
    pc = getattr(evento, 'precheck', None)
    horario = ''
    if evento.horario_inicio:
        horario = evento.horario_inicio.strftime('%H:%M') + (f" a {evento.horario_fin.strftime('%H:%M')}" if evento.horario_fin else '')
    espacio = ' - '.join(x for x in [pc.sector.nombre if pc and pc.sector else '', pc.espacio_detalle if pc else ''] if x)
    return {
        'cliente': evento.cliente.nombre if evento.cliente else '',
        'local': evento.local.nombre if evento.local else '',
        'fecha_evento': evento.fecha_evento.isoformat() if evento.fecha_evento else None,
        'horario': horario,
        'pax': evento.cantidad_personas,
        'motivo': (pc.motivo if pc else '') or '',
        'espacio': espacio,
    }


def resumen_cambios(anterior, actual):
    """Texto corto de qué cambió entre dos versiones enviadas (para el grupo del local)."""
    if not anterior:
        return 'Primera versión'
    cambios = []
    ca, cb = anterior.get('cabecera') or {}, actual.get('cabecera') or {}
    for clave, nombre in (('pax', 'Personas'), ('fecha_evento', 'Fecha'), ('horario', 'Horario'), ('espacio', 'Espacio')):
        if (ca.get(clave) or '') != (cb.get(clave) or ''):
            cambios.append(f"{nombre}: {ca.get(clave) or '—'} → {cb.get(clave) or '—'}")
    xa, xb = anterior.get('contenido') or {}, actual.get('contenido') or {}
    for clave, nombre in NOMBRES_SECCION.items():
        if json.dumps(xa.get(clave), sort_keys=True, ensure_ascii=False) != json.dumps(xb.get(clave), sort_keys=True, ensure_ascii=False):
            cambios.append(nombre)
    if (anterior.get('planos') or []) != (actual.get('planos') or []):
        cambios.append('Planos')
    return 'Cambió: ' + '; '.join(cambios) if cambios else 'Sin cambios respecto de la versión anterior'
