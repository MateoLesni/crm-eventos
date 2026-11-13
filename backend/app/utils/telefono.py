import re


def normalizar_telefono(valor):
    """Últimos 10 dígitos del teléfono, o None si no es un teléfono utilizable.

    El mismo número llega como 549..., "11 4421-0966" o "+54 9 ...": todos
    terminan en los mismos 10 dígitos.
    """
    if not valor or str(valor).startswith('email:'):
        return None
    digitos = re.sub(r'\D', '', str(valor))
    # Formato viejo con 15: 011 15 xxxx xxxx -> 11 xxxx xxxx
    if len(digitos) == 13 and digitos.startswith('01115'):
        digitos = '11' + digitos[5:]
    if len(digitos) < 8:
        return None
    return digitos[-10:]
