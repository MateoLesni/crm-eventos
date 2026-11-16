"""
Cálculos del pre-check: totales, propina, plan de pagos, alertas y ajuste por IPC.

Cómo se arma el total (según el relevamiento con Pilar):
    subtotal = conceptos contratados + adicionales del evento
    IVA      = 21% del subtotal si el evento se factura
    propina  = % del subtotal (sin IVA), discriminada aparte
    total    = subtotal + IVA + propina

Plan de pagos:
    - Seña: % configurable (50 por defecto) de lo contratado
    - Saldo: el resto de lo contratado, vence N días antes del evento (7 por defecto)
    - Adicionales del evento: se pagan al terminar (o se facturan el día hábil siguiente)
    Los pagos validados por tesorería se imputan en ese orden.
"""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

IVA = Decimal('0.21')
CENT = Decimal('0.01')


def _d(valor):
    return Decimal(str(valor or 0))


def _r(valor):
    return float(Decimal(valor).quantize(CENT, rounding=ROUND_HALF_UP))


def ordenar_items(items):
    """Ordena como se lee un pre-check: menú, barra, vinos... y el ajuste IPC al final."""
    from app.models_precheck import CATEGORIAS_PRECHECK
    orden = {c: i for i, c in enumerate(CATEGORIAS_PRECHECK)}

    def clave(x):
        return (bool(getattr(x, 'es_ajuste_ipc', False)), orden.get(x.categoria, len(orden)), x.id or 0)
    return sorted(items, key=clave)


def ordenar_catalogo(items):
    """Lista de precios en el orden de los rubros (menú, barra, vinos...), luego orden manual y nombre."""
    from app.models_precheck import CATEGORIAS_PRECHECK
    orden = {c: i for i, c in enumerate(CATEGORIAS_PRECHECK)}
    return sorted(items, key=lambda i: (orden.get(i.categoria, len(orden)), i.orden or 0, (i.nombre or '').lower()))


def proximo_dia_habil(fecha):
    """Día hábil siguiente (lunes a viernes; no contempla feriados)."""
    siguiente = fecha + timedelta(days=1)
    while siguiente.weekday() >= 5:
        siguiente += timedelta(days=1)
    return siguiente


def factor_total(evento):
    """Multiplicador que lleva de subtotal a total (IVA + propina)."""
    pc = getattr(evento, 'precheck', None)
    propina = _d(pc.propina_porcentaje) / 100 if pc else Decimal('0')
    iva = IVA if evento.facturada else Decimal('0')
    return 1 + iva + propina, iva, propina


def calcular_resumen(evento, hoy=None):
    from app.models_precheck import leer_config
    hoy = hoy or date.today()
    conceptos = list(evento.precheck_conceptos)
    adicionales = list(evento.precheck_adicionales)
    pagos = list(evento.precheck_pagos)

    total_conceptos = sum((c.subtotal for c in conceptos), Decimal('0'))
    total_adicionales = sum((_d(a.monto) for a in adicionales), Decimal('0'))
    subtotal = total_conceptos + total_adicionales
    factor, tasa_iva, tasa_propina = factor_total(evento)
    iva = subtotal * tasa_iva
    propina = subtotal * tasa_propina
    total = subtotal + iva + propina

    validados = sorted([p for p in pagos if p.estado == 'VALIDADO'], key=lambda p: (p.fecha_pago or date.max, p.id))
    total_pagado = sum((_d(p.monto) for p in validados), Decimal('0'))
    en_revision = sum((_d(p.monto) for p in pagos if p.estado == 'REVISION'), Decimal('0'))
    pendiente = total - total_pagado

    # ---- Plan de pagos
    config = leer_config()
    sena_pct = _d(config.get('sena_porcentaje') or 50) / 100
    dias_saldo = int(_d(config.get('dias_saldo_antes_evento') or 7))
    # El ajuste por IPC se cobra con el saldo: no cambia el monto de la seña
    total_ipc = sum((c.subtotal for c in conceptos if c.es_ajuste_ipc), Decimal('0'))
    contratado = (total_conceptos - total_ipc) * factor
    sena = contratado * sena_pct
    extras = total_adicionales * factor
    fecha_evento = evento.fecha_evento
    cuotas = [
        {'concepto': f'Seña ({_r(sena_pct * 100):g}%)', 'monto': sena, 'vence': None},
        {'concepto': 'Saldo' + (' (incluye ajuste IPC)' if total_ipc else ''),
         'monto': contratado - sena + total_ipc * factor,
         'vence': fecha_evento - timedelta(days=dias_saldo) if fecha_evento else None},
    ]
    if extras:
        vence_extras = None
        if fecha_evento:
            vence_extras = proximo_dia_habil(fecha_evento) if evento.facturada else fecha_evento
        cuotas.append({'concepto': 'Adicionales del evento', 'monto': extras, 'vence': vence_extras})

    disponible = total_pagado
    plan = []
    for cuota in cuotas:
        monto = cuota['monto']
        cubierto = min(max(disponible, Decimal('0')), monto) if monto > 0 else Decimal('0')
        disponible -= cubierto
        falta = monto - cubierto
        if monto <= 0 or falta <= Decimal('0.5'):
            estado = 'PAGADO' if monto > 0 else 'SIN_MONTO'
        elif cuota['vence'] and hoy > cuota['vence']:
            estado = 'VENCIDO'
        elif cubierto > 0:
            estado = 'PARCIAL'
        else:
            estado = 'PENDIENTE'
        plan.append({
            'concepto': cuota['concepto'],
            'monto': _r(monto),
            'pagado': _r(cubierto),
            'falta': _r(max(falta, Decimal('0'))),
            'vence': cuota['vence'].isoformat() if cuota['vence'] else None,
            'estado': estado,
        })

    return {
        'total_conceptos': _r(total_conceptos),
        'total_adicionales': _r(total_adicionales),
        'subtotal': _r(subtotal),
        'iva': _r(iva),
        'propina': _r(propina),
        'propina_porcentaje': _r(tasa_propina * 100),
        'total': _r(total),
        'total_pagado': _r(total_pagado),
        'en_revision': _r(en_revision),
        'pendiente': _r(pendiente),
        'fecha_sena': validados[0].fecha_pago.isoformat() if validados and validados[0].fecha_pago else None,
        'plan_pagos': plan,
        'cantidad_conceptos': len(conceptos),
        'cantidad_adicionales': len(adicionales),
        'cantidad_pagos': len(pagos),
        'tiene_items': bool(conceptos or adicionales),
    }


def calcular_alertas(evento, resumen, hoy=None):
    """Lista de avisos para que el comercial y Pilar vean qué falta o qué revisar."""
    hoy = hoy or date.today()
    pc = getattr(evento, 'precheck', None)
    alertas = []

    def alerta(nivel, texto):
        alertas.append({'nivel': nivel, 'texto': texto})

    estado = pc.estado if pc else 'BORRADOR'
    if estado == 'CERRADO':
        return alertas

    if not pc or not pc.sector_id:
        alerta('aviso', 'Falta elegir el espacio/sector del local.')
    if not pc or not (pc.motivo or '').strip():
        alerta('aviso', 'Falta el motivo del evento.')
    if not evento.horario_inicio:
        alerta('aviso', 'Falta el horario del evento.')
    if not evento.cantidad_personas:
        alerta('aviso', 'Falta la cantidad de personas.')

    if pc and pc.sector:
        s = pc.sector
        pax = evento.cantidad_personas
        if s.local_id != evento.local_id:
            alerta('error', f'El sector "{s.nombre}" es de otro local.')
        if pax and s.pax_min and pax < s.pax_min:
            alerta('error', f'{pax} personas es menos que el mínimo del sector ({s.pax_min}).')
        if pax and s.pax_max and pax > s.pax_max:
            alerta('error', f'{pax} personas supera el máximo del sector ({s.pax_max}).')

    fuera = [c for c in evento.precheck_conceptos if c.fuera_de_lista]
    if fuera and (estado in ('BORRADOR', 'EN_REVISION') or (pc and pc.modificado_post_aprobacion)):
        alerta('aviso', f'{len(fuera)} ítem(s) con precio fuera de lista o descuento: los aprueba Pilar o el Tano.')

    if pc and pc.modificado_post_aprobacion:
        alerta('aviso', 'El pre-check se modificó después de aprobado.')

    for cuota in resumen['plan_pagos']:
        if cuota['estado'] == 'VENCIDO':
            alerta('error', f"{cuota['concepto']} vencido el {date.fromisoformat(cuota['vence']):%d/%m}: faltan ${cuota['falta']:,.0f}".replace(',', '.'))

    if resumen['en_revision'] > 0:
        alerta('info', f"Hay ${resumen['en_revision']:,.0f} en pagos esperando validación de tesorería.".replace(',', '.'))

    if evento.fecha_evento and hoy > evento.fecha_evento:
        cierre = proximo_dia_habil(evento.fecha_evento)
        alerta('aviso', f'El evento ya pasó: el pre-check se cierra el {cierre:%d/%m} (primer día hábil), con los adicionales cargados.')

    return alertas


def calcular_ipc_pendiente(evento, resumen):
    """
    Ajuste por IPC que correspondería aplicar ahora.

    - Sólo sobre lo contratado que todavía no se pagó (no sobre la seña ni sobre lo ya pagado).
    - Sólo ítems marcados "ajusta por IPC" (los adicionales nunca ajustan: ya tienen precio actual).
    - Desde el mes de la seña, o desde el último ajuste aplicado, hasta el último IPC publicado.
    """
    from app.utils.ipc import calcular_ajuste_ipc

    if not resumen['fecha_sena']:
        return {'aplica': False, 'motivo': 'Todavía no hay una seña validada por tesorería.'}

    conceptos = list(evento.precheck_conceptos)
    hasta_previos = [c.ipc_periodo_hasta for c in conceptos if c.es_ajuste_ipc and c.ipc_periodo_hasta]
    if hasta_previos:
        anio, mes = map(int, max(hasta_previos).split('-'))
        fecha_base = date(anio, mes, 1)
    else:
        fecha_base = date.fromisoformat(resumen['fecha_sena'])

    factor, _, _ = factor_total(evento)
    ajustable = sum((c.subtotal for c in conceptos if c.ajusta_ipc and not c.es_ajuste_ipc), Decimal('0'))
    contratado_neto = sum((c.subtotal for c in conceptos), Decimal('0'))
    pagado_neto = _d(resumen['total_pagado']) / factor
    saldo_neto = max(contratado_neto - pagado_neto, Decimal('0'))
    base = min(ajustable, saldo_neto)

    calculo = calcular_ajuste_ipc(base, fecha_base)
    calculo['base_descripcion'] = 'Saldo pendiente de lo contratado (sin IVA ni propina), sin seña ni adicionales'
    calculo['es_continuacion'] = bool(hasta_previos)
    if base <= 0 and calculo.get('aplica'):
        calculo.update({'aplica': False, 'ajuste': 0.0, 'motivo': 'No queda saldo de lo contratado para ajustar.'})
    return calculo
