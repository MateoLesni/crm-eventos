"""
Utilidad de zona horaria para Argentina (UTC-3).
Todas las fechas/horas del CRM deben usar esta zona horaria.
"""
from datetime import datetime, timezone, timedelta

# Argentina es UTC-3 todo el año (no tiene horario de verano)
AR_TIMEZONE = timezone(timedelta(hours=-3))


def ahora_argentina():
    """Retorna datetime actual en hora argentina (UTC-3)."""
    return datetime.now(AR_TIMEZONE).replace(tzinfo=None)


def hoy_argentina():
    """Retorna date actual en Argentina."""
    return ahora_argentina().date()
