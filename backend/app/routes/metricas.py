"""
Dataset para la página de Métricas (solo admin).

Devuelve una fila por evento con lo necesario para calcular todas las métricas en
el navegador, de modo que cada número se pueda abrir y ver qué eventos lo forman.
Incluye los tiempos de cada etapa (del historial de transiciones) y el motivo de
rechazo agrupado por tema.
"""
import re
import unicodedata
from collections import defaultdict

from flask import Blueprint, jsonify
from sqlalchemy.orm import joinedload

from app import db
from app.models import Evento, EventoTransicion
from app.utils.clientes import resumen_recurrencia
from app.utils.seguridad import admin_requerido
from app.utils.timezone import ahora_argentina

metricas_bp = Blueprint('metricas', __name__)

# Etapas cuyo primer ingreso se mide (el estado se calcula solo y puede saltear etapas)
ETAPAS_MEDIDAS = ('ASIGNADO', 'CONTACTADO', 'COTIZADO', 'APROBADO', 'RECHAZADO')

# Motivos de rechazo: texto libre agrupado por tema. El orden importa: gana la primera regla.
MOTIVOS = [
    ('Spam o error de carga', ('spam', 'error de sistema', 'error de carga', 'prueba', 'derivado a multi', 'a multi', 'multireserva',
                               'multi reserva')),
    ('Duplicado', ('duplicad', 'repetid', 'ya existe', 'misma consulta')),
    ('Cerró con otro lugar', ('otro lado', 'otro lugar', 'otro salon', 'otro espacio', 'otro venue', 'otro local',
                              'cerro con', 'cerraron con', 'eligio otro', 'eligieron otro', 'se fue con', 'competencia',
                              'otra opcion', 'otra propuesta', 'otra alternativa', 'opto por', 'optaron por',
                              'avanzaron con', 'avanzamos con', 'fueron con', 'elegi lugar', 'ya elegi', 'con otro!', 'se decidio por', 'se decidieron por', 'contrato otro')),
    ('Precio o presupuesto', ('precio', 'caro', 'costo', 'excede', 'econom', 'plata', 'barato', 'valor',
                              'presupuesto', 'presuppuesto', 'no le cerro', 'no les cerro', 'cara ')),
    ('Sin disponibilidad', ('disponib', 'disp ', 'disp.', 'ocupad', 'sin lugar', 'no hay lugar', 'lleno', 'tomada',
                            'reservad', 'sin fecha', 'no tenemos fecha')),
    ('Fecha pasada sin cierre', ('paso la fecha', 'ya paso', 'fecha pasada', 'pasada la fecha', 'se paso', 'vencid',
                                 'paso el evento', 'viejo', 'antigu')),
    ('No responde', ('respond', 'contest', 'respuesta', 'no devolv', 'no volvio', 'visto', 'no atiende',
                     'sin contacto', 'no se pudo contactar', 'no hubo contacto', 'no lee')),
    ('Cliente no avanza o cancela', ('no avanza', 'no avanzo', 'no sigue', 'cancel', 'suspend', 'posterg', 'no se hace',
                                     'no realiza', 'desist', 'no va a hacer', 'no lo hace', 'decidio no', 'se cayo',
                                     'de baja', 'interesad', 'interes', 'en su casa', 'resolvi', 'ya lo pude', 'no lo van a hacer', 'no se realiza')),
    ('No era lo que buscaba', ('no buscaba', 'boliche', 'otro tipo', 'no es lo que', 'no aplica', 'no corresponde',
                               'no hacemos', 'no ofrecemos')),
    ('Capacidad o mínimo', ('capacidad', 'minimo', 'muy grande', 'muy chico', 'pocas personas', 'muchas personas',
                            'cantidad de personas', 'menos de 20', 'menos de 15', 'menos de 10')),
]


def _normalizar(texto):
    t = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', t)


def categorizar_motivo(texto):
    if not texto or not texto.strip():
        return 'Sin motivo cargado'
    t = _normalizar(texto)
    for categoria, claves in MOTIVOS:
        if any(c in t for c in claves):
            return categoria
    return 'Otro'


def _iso(valor):
    return valor.isoformat() if valor else None


# GET /api/metricas/dataset
@metricas_bp.route('/dataset', methods=['GET'])
@admin_requerido
def dataset():
    eventos = (Evento.query
               .options(joinedload(Evento.cliente), joinedload(Evento.local), joinedload(Evento.comercial))
               .order_by(Evento.id.asc())
               .all())

    # Primer ingreso a cada etapa y si el evento vino de la migración, en una sola consulta
    primer_ingreso = defaultdict(dict)
    migrados = set()
    filas = (db.session.query(EventoTransicion.evento_id, EventoTransicion.estado_nuevo,
                              EventoTransicion.origen, db.func.min(EventoTransicion.created_at))
             .group_by(EventoTransicion.evento_id, EventoTransicion.estado_nuevo, EventoTransicion.origen)
             .all())
    for evento_id, estado, origen, cuando in filas:
        if origen == 'migracion':
            migrados.add(evento_id)
            continue
        if estado in ETAPAS_MEDIDAS:
            previo = primer_ingreso[evento_id].get(estado)
            if previo is None or cuando < previo:
                primer_ingreso[evento_id][estado] = cuando

    recurrencia = resumen_recurrencia({e.cliente_id for e in eventos})

    datos = []
    for e in eventos:
        etapas = primer_ingreso.get(e.id, {})
        rec = recurrencia.get(e.cliente_id, {})
        datos.append({
            'id': e.id,
            'estado': e.estado,
            'local': e.local.nombre if e.local else None,
            'comercial_id': e.comercial_id,
            'comercial': e.comercial.nombre if e.comercial else None,
            'cliente': e.cliente.nombre if e.cliente else None,
            'cliente_id': e.cliente_id,
            'recurrente': bool(rec.get('es_cliente_recurrente')),
            'agencia': bool(e.cliente.es_agencia) if e.cliente else False,
            'creado': _iso(e.created_at),
            'fecha_evento': _iso(e.fecha_evento),
            'monto': float(e.presupuesto) if e.presupuesto else 0,
            'pax': e.cantidad_personas,
            'tipo': e.tipo,
            'canal': e.canal_origen,
            'campana': e.utm_campaign,
            'tentativo': bool(e.es_tentativo),
            'motivo': (e.motivo_rechazo or '')[:200] if e.estado == 'RECHAZADO' else None,
            'motivo_categoria': categorizar_motivo(e.motivo_rechazo) if e.estado == 'RECHAZADO' else None,
            'migrado': e.id in migrados,
            'ultimo_cambio': _iso(e.fecha_ultimo_cambio_estado or e.created_at),
            't_asignado': _iso(etapas.get('ASIGNADO')),
            't_contactado': _iso(etapas.get('CONTACTADO')),
            't_cotizado': _iso(etapas.get('COTIZADO')),
            't_vendido': _iso(etapas.get('APROBADO')),
            't_rechazado': _iso(etapas.get('RECHAZADO')),
        })

    return jsonify({
        'generado': ahora_argentina().isoformat(),
        'eventos': datos,
    })
