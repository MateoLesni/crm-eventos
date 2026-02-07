"""
Utilidades para normalización de números de teléfono argentinos
y manejo de formatos de WhatsApp/Evolution API
"""
import re


def normalizar_numero_argentino(numero):
    """
    Normaliza un número de teléfono argentino a formato estándar.

    Entrada: +54 9 11 2439 5923, 011 2439 5923, 541124395923, etc.
    Salida: 5491124395923 (siempre con 549 para móviles argentinos)

    Args:
        numero: Número de teléfono en cualquier formato

    Returns:
        str: Número normalizado en formato 549XXXXXXXXXX o None si es inválido
    """
    if not numero:
        return None

    numero = str(numero)

    # Limpiar caracteres no numéricos (espacios, guiones, paréntesis, puntos)
    numero_limpio = re.sub(r'[\s\-\(\)\.]', '', numero)

    # Quitar el + inicial si existe
    numero_limpio = numero_limpio.lstrip('+')

    # Ya tiene formato correcto (empieza con 549)
    if numero_limpio.startswith('549'):
        return numero_limpio

    # Tiene 54 pero no el 9 (agregar el 9 para móviles)
    if numero_limpio.startswith('54') and not numero_limpio.startswith('549'):
        # Verificar que después del 54 no venga el 9
        if len(numero_limpio) > 2 and numero_limpio[2] != '9':
            return '549' + numero_limpio[2:]
        return numero_limpio

    # Número local que empieza con 0 (ej: 011 2439 5923)
    if numero_limpio.startswith('0'):
        # Quitar el 0 y agregar 549
        return '549' + numero_limpio[1:]

    # Número sin código de país (ej: 1124395923)
    if not numero_limpio.startswith('54'):
        return '549' + numero_limpio

    return numero_limpio


def numero_a_whatsapp_jid(numero):
    """
    Convierte número a formato remoteJid de WhatsApp.

    Args:
        numero: Número de teléfono en cualquier formato

    Returns:
        str: Número en formato 5491124395923@s.whatsapp.net o None
    """
    numero_normalizado = normalizar_numero_argentino(numero)
    if not numero_normalizado:
        return None
    return f"{numero_normalizado}@s.whatsapp.net"


def whatsapp_jid_a_numero(remote_jid):
    """
    Extrae el número de un remoteJid de WhatsApp.

    Args:
        remote_jid: ID de WhatsApp (ej: 5491124395923@s.whatsapp.net)

    Returns:
        str: Número sin el sufijo @s.whatsapp.net o None
    """
    if not remote_jid:
        return None
    return remote_jid.split('@')[0]


def es_numero_argentino_valido(numero):
    """
    Verifica si un número parece ser un número argentino válido.

    Args:
        numero: Número normalizado (debe empezar con 549)

    Returns:
        bool: True si parece válido
    """
    if not numero:
        return False

    numero_limpio = normalizar_numero_argentino(numero)
    if not numero_limpio:
        return False

    # Debe empezar con 549 y tener entre 12-13 dígitos
    return (
        numero_limpio.startswith('549') and
        len(numero_limpio) >= 12 and
        len(numero_limpio) <= 14
    )


def formatear_numero_display(numero):
    """
    Formatea un número para mostrar al usuario.

    Args:
        numero: Número normalizado (ej: 5491124395923)

    Returns:
        str: Número formateado (ej: +54 9 11 2439-5923)
    """
    if not numero:
        return None

    numero_limpio = normalizar_numero_argentino(numero)
    if not numero_limpio or len(numero_limpio) < 10:
        return numero

    # Formato: +54 9 XX XXXX-XXXX
    if numero_limpio.startswith('549') and len(numero_limpio) >= 12:
        # +54 9 + código área (2-4 dígitos) + número
        codigo_area = numero_limpio[3:5]  # Asumimos 2 dígitos para CABA/GBA
        resto = numero_limpio[5:]

        if len(resto) >= 8:
            return f"+54 9 {codigo_area} {resto[:4]}-{resto[4:]}"

    return numero
