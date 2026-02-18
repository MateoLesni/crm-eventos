from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Usuario, Local, Cliente, EventoTransicion
from app.models_precheck import PrecheckConcepto, PrecheckAdicional, PrecheckPago, calcular_resumen_precheck
from sqlalchemy import func, case, and_, or_, extract
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta
from decimal import Decimal

reportes_bp = Blueprint('reportes', __name__)


@reportes_bp.route('', methods=['GET'])
def obtener_reportes():
    """
    Endpoint principal de reportes para el dashboard admin.

    Query params:
    - fecha_desde: YYYY-MM-DD (default: 30 días atrás)
    - fecha_hasta: YYYY-MM-DD (default: hoy)
    - agrupacion: 'diario' o 'semanal' (default: diario)
    """
    # Parsear fechas
    fecha_hasta_str = request.args.get('fecha_hasta')
    fecha_desde_str = request.args.get('fecha_desde')
    agrupacion = request.args.get('agrupacion', 'diario')

    if fecha_hasta_str:
        fecha_hasta = datetime.strptime(fecha_hasta_str, '%Y-%m-%d').date()
    else:
        fecha_hasta = datetime.utcnow().date()

    if fecha_desde_str:
        fecha_desde = datetime.strptime(fecha_desde_str, '%Y-%m-%d').date()
    else:
        fecha_desde = fecha_hasta - timedelta(days=30)

    # === KPIs ===
    kpis = calcular_kpis(fecha_desde, fecha_hasta)

    # === VOLUMEN POR PERÍODO ===
    volumen_periodo = calcular_volumen_periodo(fecha_desde, fecha_hasta, agrupacion)

    # === CANALES x LOCAL ===
    canales_local = calcular_canales_local(fecha_desde, fecha_hasta)

    # === COMERCIALES ===
    comerciales = calcular_comerciales(fecha_desde, fecha_hasta)

    return jsonify({
        'filtros': {
            'fecha_desde': fecha_desde.isoformat(),
            'fecha_hasta': fecha_hasta.isoformat(),
            'agrupacion': agrupacion
        },
        'kpis': kpis,
        'volumen_periodo': volumen_periodo,
        'canales_local': canales_local,
        'comerciales': comerciales
    })


def calcular_kpis(fecha_desde, fecha_hasta):
    """
    Calcula los KPIs separados en dos categorías:

    1. ESTADO ACTUAL (foto instantánea - NO cambian con filtro de fechas):
       - sin_asignar: Eventos en CONSULTA_ENTRANTE sin comercial
       - cotizados_abiertos: Eventos en estado COTIZADO esperando respuesta
       - monto_en_negociacion: Suma de presupuestos de eventos COTIZADO

    2. EN EL PERÍODO (filtrados por fecha - SÍ cambian con filtro):
       - solicitudes: Eventos creados en el período
       - cerrados: Eventos que pasaron a APROBADO en el período
       - perdidos: Eventos que pasaron a RECHAZADO en el período
       - monto_cerrado: Suma de presupuestos de eventos cerrados en el período
       - tasa_cierre: cerrados / (cerrados + perdidos)
    """

    # ==========================================
    # ESTADO ACTUAL (foto instantánea)
    # ==========================================

    # Sin asignar - eventos entrantes sin comercial asignado
    sin_asignar = Evento.query.filter(
        Evento.estado == 'CONSULTA_ENTRANTE',
        Evento.comercial_id.is_(None)
    ).count()

    # Cotizados abiertos - eventos esperando respuesta del cliente
    cotizados_abiertos = Evento.query.filter(
        Evento.estado == 'COTIZADO'
    ).count()

    # Monto en negociación - suma de presupuestos de cotizados
    monto_en_negociacion = db.session.query(
        func.sum(Evento.presupuesto)
    ).filter(
        Evento.estado == 'COTIZADO'
    ).scalar() or 0

    # ==========================================
    # EN EL PERÍODO (filtrado por fechas)
    # ==========================================

    # Solicitudes creadas en el período
    solicitudes = Evento.query.filter(
        func.date(Evento.created_at) >= fecha_desde,
        func.date(Evento.created_at) <= fecha_hasta
    ).count()

    # Cerrados en el período: eventos que TRANSITARON a APROBADO en el período
    # Usamos la tabla de transiciones para saber CUÁNDO pasó a aprobado
    cerrados = db.session.query(EventoTransicion).filter(
        EventoTransicion.estado_nuevo == 'APROBADO',
        func.date(EventoTransicion.created_at) >= fecha_desde,
        func.date(EventoTransicion.created_at) <= fecha_hasta
    ).count()

    # Perdidos en el período: eventos que TRANSITARON a RECHAZADO en el período
    perdidos = db.session.query(EventoTransicion).filter(
        EventoTransicion.estado_nuevo == 'RECHAZADO',
        func.date(EventoTransicion.created_at) >= fecha_desde,
        func.date(EventoTransicion.created_at) <= fecha_hasta
    ).count()

    # Monto cerrado: suma de presupuestos de eventos cerrados EN EL PERÍODO
    # Obtenemos los IDs de eventos que pasaron a APROBADO en el período
    eventos_cerrados_ids = db.session.query(EventoTransicion.evento_id).filter(
        EventoTransicion.estado_nuevo == 'APROBADO',
        func.date(EventoTransicion.created_at) >= fecha_desde,
        func.date(EventoTransicion.created_at) <= fecha_hasta
    ).distinct().subquery()

    monto_cerrado = db.session.query(
        func.sum(Evento.presupuesto)
    ).filter(
        Evento.id.in_(eventos_cerrados_ids)
    ).scalar() or 0

    # Tasa de cierre
    total_finalizados = cerrados + perdidos
    tasa_cierre = round((cerrados / total_finalizados * 100), 1) if total_finalizados > 0 else 0

    return {
        # Estado actual (foto instantánea - no cambia con fechas)
        'estado_actual': {
            'sin_asignar': sin_asignar,
            'cotizados_abiertos': cotizados_abiertos,
            'monto_en_negociacion': float(monto_en_negociacion)
        },
        # En el período (sí cambia con fechas)
        'en_periodo': {
            'solicitudes': solicitudes,
            'cerrados': cerrados,
            'perdidos': perdidos,
            'monto_cerrado': float(monto_cerrado),
            'tasa_cierre': tasa_cierre
        }
    }


def calcular_volumen_periodo(fecha_desde, fecha_hasta, agrupacion):
    """Calcula el volumen de eventos por período (diario o semanal)"""

    if agrupacion == 'semanal':
        # Agrupar por semana (lunes)
        date_trunc = func.date(Evento.created_at - func.strftime('%w', Evento.created_at) + 1)
    else:
        # Agrupar por día
        date_trunc = func.date(Evento.created_at)

    # Query con conteo por estado
    query = db.session.query(
        date_trunc.label('fecha'),
        func.count(Evento.id).label('total'),
        func.sum(case((Evento.estado == 'CONSULTA_ENTRANTE', 1), else_=0)).label('consulta_entrante'),
        func.sum(case((Evento.estado == 'ASIGNADO', 1), else_=0)).label('asignado'),
        func.sum(case((Evento.estado == 'CONTACTADO', 1), else_=0)).label('contactado'),
        func.sum(case((Evento.estado == 'COTIZADO', 1), else_=0)).label('cotizado'),
        func.sum(case((Evento.estado == 'APROBADO', 1), else_=0)).label('aprobado'),
        func.sum(case((Evento.estado == 'RECHAZADO', 1), else_=0)).label('rechazado'),
    ).filter(
        func.date(Evento.created_at) >= fecha_desde,
        func.date(Evento.created_at) <= fecha_hasta
    ).group_by(date_trunc).order_by(date_trunc.desc()).all()

    # Calcular totales
    totales = {
        'total': 0,
        'consulta_entrante': 0,
        'asignado': 0,
        'contactado': 0,
        'cotizado': 0,
        'aprobado': 0,
        'rechazado': 0
    }

    filas = []
    for row in query:
        fila = {
            'fecha': row.fecha if isinstance(row.fecha, str) else row.fecha.isoformat() if row.fecha else None,
            'total': row.total or 0,
            'consulta_entrante': row.consulta_entrante or 0,
            'asignado': row.asignado or 0,
            'contactado': row.contactado or 0,
            'cotizado': row.cotizado or 0,
            'aprobado': row.aprobado or 0,
            'rechazado': row.rechazado or 0
        }
        filas.append(fila)

        # Acumular totales
        for key in totales:
            totales[key] += fila[key]

    return {
        'filas': filas,
        'totales': totales
    }


def calcular_canales_local(fecha_desde, fecha_hasta):
    """Calcula la distribución de canales por local"""

    # Obtener locales activos
    locales = Local.query.filter_by(activo=True).all()

    # Query de canales con conteo por local
    query = db.session.query(
        Evento.canal_origen,
        Evento.local_id,
        func.count(Evento.id).label('cantidad')
    ).filter(
        func.date(Evento.created_at) >= fecha_desde,
        func.date(Evento.created_at) <= fecha_hasta
    ).group_by(Evento.canal_origen, Evento.local_id).all()

    # Organizar datos
    canales_data = {}
    totales_por_canal = {}
    totales_por_local = {local.id: 0 for local in locales}

    for row in query:
        canal = row.canal_origen or 'sin_canal'
        local_id = row.local_id
        cantidad = row.cantidad or 0

        if canal not in canales_data:
            canales_data[canal] = {'total': 0, 'locales': {}}
            totales_por_canal[canal] = 0

        canales_data[canal]['total'] += cantidad
        totales_por_canal[canal] += cantidad

        if local_id:
            canales_data[canal]['locales'][local_id] = cantidad
            totales_por_local[local_id] = totales_por_local.get(local_id, 0) + cantidad

    # Calcular porcentajes y formatear
    total_general = sum(totales_por_canal.values())

    filas = []
    for canal, data in canales_data.items():
        fila = {
            'canal': canal,
            'total': data['total'],
            'porcentaje': round(data['total'] / total_general * 100, 1) if total_general > 0 else 0,
            'locales': {}
        }

        for local in locales:
            cantidad_local = data['locales'].get(local.id, 0)
            porcentaje_local = round(cantidad_local / data['total'] * 100, 1) if data['total'] > 0 else 0
            fila['locales'][local.id] = {
                'cantidad': cantidad_local,
                'porcentaje': porcentaje_local
            }

        filas.append(fila)

    # Ordenar por total descendente
    filas.sort(key=lambda x: x['total'], reverse=True)

    return {
        'locales': [{'id': l.id, 'nombre': l.nombre, 'color': l.color} for l in locales],
        'filas': filas,
        'totales_por_local': totales_por_local,
        'total_general': total_general
    }


def calcular_comerciales(fecha_desde, fecha_hasta):
    """Calcula la carga y performance por comercial"""

    # Obtener comerciales activos
    comerciales = Usuario.query.filter_by(activo=True, rol='comercial').all()

    # Query de eventos por comercial y estado
    query = db.session.query(
        Evento.comercial_id,
        Evento.estado,
        func.count(Evento.id).label('cantidad')
    ).filter(
        func.date(Evento.created_at) >= fecha_desde,
        func.date(Evento.created_at) <= fecha_hasta
    ).group_by(Evento.comercial_id, Evento.estado).all()

    # Organizar datos
    comerciales_data = {}

    # Inicializar con comerciales conocidos
    for comercial in comerciales:
        comerciales_data[comercial.id] = {
            'nombre': comercial.nombre,
            'consulta_entrante': 0,
            'asignado': 0,
            'contactado': 0,
            'cotizado': 0,
            'aprobado': 0,
            'rechazado': 0,
            'total': 0
        }

    # Agregar "En Blanco" para eventos sin comercial
    comerciales_data[None] = {
        'nombre': 'Sin asignar',
        'consulta_entrante': 0,
        'asignado': 0,
        'contactado': 0,
        'cotizado': 0,
        'aprobado': 0,
        'rechazado': 0,
        'total': 0
    }

    for row in query:
        comercial_id = row.comercial_id
        estado = row.estado.lower() if row.estado else 'consulta_entrante'
        cantidad = row.cantidad or 0

        if comercial_id not in comerciales_data:
            # Comercial no activo o eliminado
            comercial = Usuario.query.get(comercial_id)
            comerciales_data[comercial_id] = {
                'nombre': comercial.nombre if comercial else f'ID {comercial_id}',
                'consulta_entrante': 0,
                'asignado': 0,
                'contactado': 0,
                'cotizado': 0,
                'aprobado': 0,
                'rechazado': 0,
                'total': 0
            }

        if estado in comerciales_data[comercial_id]:
            comerciales_data[comercial_id][estado] = cantidad
        comerciales_data[comercial_id]['total'] += cantidad

    # Calcular totales generales
    totales = {
        'consulta_entrante': 0,
        'asignado': 0,
        'contactado': 0,
        'cotizado': 0,
        'aprobado': 0,
        'rechazado': 0,
        'total': 0
    }

    filas = []
    for comercial_id, data in comerciales_data.items():
        # Calcular participación
        total_general = sum(c['total'] for c in comerciales_data.values())
        participacion = round(data['total'] / total_general * 100, 1) if total_general > 0 else 0

        fila = {
            'comercial_id': comercial_id,
            'nombre': data['nombre'],
            'consulta_entrante': data['consulta_entrante'],
            'asignado': data['asignado'],
            'contactado': data['contactado'],
            'cotizado': data['cotizado'],
            'aprobado': data['aprobado'],
            'rechazado': data['rechazado'],
            'total': data['total'],
            'participacion': participacion
        }
        filas.append(fila)

        # Acumular totales
        for key in totales:
            totales[key] += data.get(key, 0)

    # Ordenar: Sin asignar primero, luego por total descendente
    filas.sort(key=lambda x: (x['comercial_id'] is not None, -x['total']))

    return {
        'filas': filas,
        'totales': totales
    }


# ============================================================
# REPORTES FINANCIEROS (Estratégicos)
# ============================================================

@reportes_bp.route('/financiero', methods=['GET'])
def obtener_reportes_financieros():
    """
    Reportes financieros para el CEO.

    Query params:
    - fecha_desde: YYYY-MM-DD (fecha del evento)
    - fecha_hasta: YYYY-MM-DD (fecha del evento)
    - local_id: filtrar por local

    Retorna:
    1. Flujo de pagos: matriz mes_evento x mes_pago
    2. Resumen de saldos: estado de cada evento
    """
    # Parsear filtros
    fecha_hasta_str = request.args.get('fecha_hasta')
    fecha_desde_str = request.args.get('fecha_desde')
    local_id = request.args.get('local_id')

    if fecha_hasta_str:
        fecha_hasta = datetime.strptime(fecha_hasta_str, '%Y-%m-%d').date()
    else:
        fecha_hasta = datetime.utcnow().date()

    if fecha_desde_str:
        fecha_desde = datetime.strptime(fecha_desde_str, '%Y-%m-%d').date()
    else:
        # Por defecto, último año
        fecha_desde = fecha_hasta.replace(year=fecha_hasta.year - 1)

    local_id = int(local_id) if local_id else None

    # Obtener locales para filtros
    locales = Local.query.filter_by(activo=True).all()

    # Calcular reportes
    flujo_pagos = calcular_flujo_pagos(fecha_desde, fecha_hasta, local_id)
    resumen_saldos = calcular_resumen_saldos(fecha_desde, fecha_hasta, local_id)
    canales_local = calcular_canales_local(fecha_desde, fecha_hasta)

    return jsonify({
        'filtros': {
            'fecha_desde': fecha_desde.isoformat(),
            'fecha_hasta': fecha_hasta.isoformat(),
            'local_id': local_id
        },
        'locales': [{'id': l.id, 'nombre': l.nombre, 'color': l.color} for l in locales],
        'flujo_pagos': flujo_pagos,
        'resumen_saldos': resumen_saldos,
        'canales_local': canales_local
    })


def calcular_flujo_pagos(fecha_desde, fecha_hasta, local_id=None):
    """
    Calcula la matriz de flujo de pagos:
    - Filas: Mes del evento
    - Columnas: Mes en que se realizó el pago
    - Valores: Montos pagados

    Similar al reporte de Google Sheets compartido.
    """
    # Query base: eventos APROBADOS o CONCLUIDOS con fecha_evento en el rango
    query = db.session.query(Evento).options(
        joinedload(Evento.local)
    ).filter(
        Evento.estado.in_(['APROBADO', 'CONCLUIDO']),
        Evento.fecha_evento.isnot(None),
        Evento.fecha_evento >= fecha_desde,
        Evento.fecha_evento <= fecha_hasta
    )

    if local_id:
        query = query.filter(Evento.local_id == local_id)

    eventos = query.all()
    evento_ids = [e.id for e in eventos]

    if not evento_ids:
        return {
            'columnas_pago': [],
            'filas': [],
            'totales_por_mes_pago': {},
            'total_general_eventos': 0,
            'total_general_pagado': 0
        }

    # Cargar todos los datos de precheck en batch (evita N+1 queries)
    conceptos_by_evento = {}
    for c in PrecheckConcepto.query.filter(PrecheckConcepto.evento_id.in_(evento_ids)).all():
        conceptos_by_evento.setdefault(c.evento_id, []).append(c)

    adicionales_by_evento = {}
    for a in PrecheckAdicional.query.filter(PrecheckAdicional.evento_id.in_(evento_ids)).all():
        adicionales_by_evento.setdefault(a.evento_id, []).append(a)

    pagos_by_evento = {}
    for p in PrecheckPago.query.filter(PrecheckPago.evento_id.in_(evento_ids)).all():
        pagos_by_evento.setdefault(p.evento_id, []).append(p)

    # Estructura para acumular datos
    meses_evento = {}
    meses_pago = set()

    for evento in eventos:
        if not evento.fecha_evento:
            continue

        mes_evento_key = evento.fecha_evento.strftime('%b/%y').lower()

        if mes_evento_key not in meses_evento:
            meses_evento[mes_evento_key] = {
                'fecha_orden': evento.fecha_evento.strftime('%Y-%m'),
                'total_evento': Decimal('0'),
                'pagos_por_mes': {}
            }

        # Calcular total del evento usando datos pre-cargados
        conceptos = conceptos_by_evento.get(evento.id, [])
        adicionales = adicionales_by_evento.get(evento.id, [])

        total_conceptos = sum(
            Decimal(str(c.cantidad)) * Decimal(str(c.precio_unitario))
            for c in conceptos
        )
        total_adicionales = sum(
            Decimal(str(a.monto)) for a in adicionales
        )
        subtotal = total_conceptos + total_adicionales

        iva = Decimal('0')
        if evento.facturada:
            iva = subtotal * Decimal('0.21')

        total_evento = subtotal + iva
        meses_evento[mes_evento_key]['total_evento'] += total_evento

        # Procesar pagos pre-cargados
        for pago in pagos_by_evento.get(evento.id, []):
            if not pago.fecha_pago:
                continue

            mes_pago_key = pago.fecha_pago.strftime('%b/%y').lower()
            meses_pago.add((pago.fecha_pago.strftime('%Y-%m'), mes_pago_key))

            if mes_pago_key not in meses_evento[mes_evento_key]['pagos_por_mes']:
                meses_evento[mes_evento_key]['pagos_por_mes'][mes_pago_key] = Decimal('0')

            meses_evento[mes_evento_key]['pagos_por_mes'][mes_pago_key] += Decimal(str(pago.monto))

    # Ordenar meses de pago cronológicamente
    meses_pago_ordenados = sorted(list(meses_pago), key=lambda x: x[0])
    columnas_pago = [m[1] for m in meses_pago_ordenados]

    # Construir filas ordenadas cronológicamente
    filas = []
    totales_por_mes_pago = {col: Decimal('0') for col in columnas_pago}
    total_general_eventos = Decimal('0')

    for mes_key in sorted(meses_evento.keys(), key=lambda x: meses_evento[x]['fecha_orden']):
        data = meses_evento[mes_key]
        fila = {
            'mes_evento': mes_key,
            'total_evento': float(data['total_evento']),
            'pagos': {}
        }

        total_fila = Decimal('0')
        for col in columnas_pago:
            monto = data['pagos_por_mes'].get(col, Decimal('0'))
            fila['pagos'][col] = float(monto)
            totales_por_mes_pago[col] += monto
            total_fila += monto

        fila['total_pagado'] = float(total_fila)
        filas.append(fila)
        total_general_eventos += data['total_evento']

    # Calcular totales
    total_general_pagado = sum(totales_por_mes_pago.values())

    return {
        'columnas_pago': columnas_pago,
        'filas': filas,
        'totales_por_mes_pago': {k: float(v) for k, v in totales_por_mes_pago.items()},
        'total_general_eventos': float(total_general_eventos),
        'total_general_pagado': float(total_general_pagado)
    }


def calcular_resumen_saldos(fecha_desde, fecha_hasta, local_id=None):
    """
    Calcula el resumen de saldos de eventos:
    - Lista de eventos con monto, pagado, restante, estado

    Similar al segundo reporte de Google Sheets.
    """
    # Query base: eventos APROBADOS o CONCLUIDOS
    query = db.session.query(Evento).options(
        joinedload(Evento.local),
        joinedload(Evento.cliente)
    ).filter(
        Evento.estado.in_(['APROBADO', 'CONCLUIDO']),
        Evento.fecha_evento.isnot(None),
        Evento.fecha_evento >= fecha_desde,
        Evento.fecha_evento <= fecha_hasta
    )

    if local_id:
        query = query.filter(Evento.local_id == local_id)

    eventos = query.order_by(Evento.fecha_evento.desc()).all()
    evento_ids = [e.id for e in eventos]

    if not evento_ids:
        return {
            'filas': [],
            'totales': {
                'monto_evento': 0,
                'monto_abonado': 0,
                'restante': 0,
                'cantidad_eventos': 0,
                'cantidad_saldados': 0,
                'cantidad_pendientes': 0
            }
        }

    # Cargar todos los datos de precheck en batch
    conceptos_by_evento = {}
    for c in PrecheckConcepto.query.filter(PrecheckConcepto.evento_id.in_(evento_ids)).all():
        conceptos_by_evento.setdefault(c.evento_id, []).append(c)

    adicionales_by_evento = {}
    for a in PrecheckAdicional.query.filter(PrecheckAdicional.evento_id.in_(evento_ids)).all():
        adicionales_by_evento.setdefault(a.evento_id, []).append(a)

    pagos_by_evento = {}
    for p in PrecheckPago.query.filter(PrecheckPago.evento_id.in_(evento_ids)).all():
        pagos_by_evento.setdefault(p.evento_id, []).append(p)

    filas = []
    totales = {
        'monto_evento': Decimal('0'),
        'monto_abonado': Decimal('0'),
        'restante': Decimal('0'),
        'cantidad_saldados': 0,
        'cantidad_pendientes': 0
    }

    for evento in eventos:
        conceptos = conceptos_by_evento.get(evento.id, [])
        adicionales = adicionales_by_evento.get(evento.id, [])
        pagos = pagos_by_evento.get(evento.id, [])

        total_conceptos = sum(
            Decimal(str(c.cantidad)) * Decimal(str(c.precio_unitario))
            for c in conceptos
        )
        total_adicionales = sum(
            Decimal(str(a.monto)) for a in adicionales
        )
        subtotal = total_conceptos + total_adicionales

        iva = Decimal('0')
        if evento.facturada:
            iva = subtotal * Decimal('0.21')

        monto_evento = subtotal + iva
        monto_abonado = sum(Decimal(str(p.monto)) for p in pagos)
        restante = monto_evento - monto_abonado

        if monto_evento == 0:
            estado_saldo = 'Sin presupuesto'
        elif restante <= 0:
            estado_saldo = 'Evento saldado'
            totales['cantidad_saldados'] += 1
        else:
            estado_saldo = 'Pagos pendientes'
            totales['cantidad_pendientes'] += 1

        mes_evento = evento.fecha_evento.strftime('%B').lower() if evento.fecha_evento else ''

        filas.append({
            'id': evento.id,
            'local': evento.local.nombre if evento.local else 'Sin local',
            'local_color': evento.local.color if evento.local else None,
            'cliente': evento.cliente.nombre if evento.cliente else 'Sin cliente',
            'fecha_evento': evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            'mes_evento': mes_evento,
            'monto_evento': float(monto_evento),
            'monto_abonado': float(monto_abonado),
            'restante': float(restante),
            'estado_saldo': estado_saldo
        })

        totales['monto_evento'] += monto_evento
        totales['monto_abonado'] += monto_abonado
        totales['restante'] += restante

    return {
        'filas': filas,
        'totales': {
            'monto_evento': float(totales['monto_evento']),
            'monto_abonado': float(totales['monto_abonado']),
            'restante': float(totales['restante']),
            'cantidad_eventos': len(filas),
            'cantidad_saldados': totales['cantidad_saldados'],
            'cantidad_pendientes': totales['cantidad_pendientes']
        }
    }
