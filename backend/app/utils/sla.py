"""
Configuración y cálculo de SLA (Service Level Agreement) para eventos.
Define umbrales por estado y calcula si un evento está en alerta o crítico.
"""
from app.utils.timezone import ahora_argentina

# Umbrales SLA por estado (en segundos)
# alerta = amarillo (warning), critico = rojo (requiere acción inmediata)
SLA_CONFIG = {
    'CONSULTA_ENTRANTE': {'alerta': 24 * 3600, 'critico': 48 * 3600},       # 24h / 48h
    'ASIGNADO':          {'alerta': 24 * 3600, 'critico': 48 * 3600},       # 24h / 48h
    'CONTACTADO':        {'alerta': 7 * 24 * 3600, 'critico': 14 * 24 * 3600},  # 7d / 14d
    'COTIZADO':          {'alerta': 24 * 3600, 'critico': 48 * 3600},       # 24h / 48h
}

# Estados que NO tienen seguimiento SLA
ESTADOS_SIN_SLA = ['APROBADO', 'RECHAZADO', 'CONCLUIDO', 'ELIMINADO', 'MULTIRESERVA']


def calcular_sla_evento(evento):
    """
    Calcula el estado SLA de un evento.

    Args:
        evento: Objeto Evento (SQLAlchemy)

    Returns:
        dict con {status, segundos, umbral_alerta, umbral_critico} o None si no aplica SLA
    """
    config = SLA_CONFIG.get(evento.estado)
    if not config:
        return None

    fecha_ref = evento.fecha_ultimo_cambio_estado or evento.created_at
    if not fecha_ref:
        return None

    segundos = (ahora_argentina() - fecha_ref).total_seconds()

    if segundos >= config['critico']:
        status = 'critico'
    elif segundos >= config['alerta']:
        status = 'alerta'
    else:
        status = 'ok'

    return {
        'status': status,
        'segundos': int(segundos),
        'umbral_alerta': config['alerta'],
        'umbral_critico': config['critico'],
    }
