import { useState, useEffect } from 'react';
import api from '../services/api';
import './ReportesFinancieros.css';

// Mapeo de nombres de color a códigos hex
const COLOR_MAP = {
  'azul': '#3b82f6',
  'verde': '#22c55e',
  'amarillo': '#f59e0b',
  'violeta': '#8b5cf6',
  'rojo': '#ef4444',
  'rosa': '#ec4899',
  'naranja': '#f97316',
  'cyan': '#06b6d4',
};

const getColorHex = (color) => {
  if (!color) return '#6b7280';
  if (color.startsWith('#')) return color;
  return COLOR_MAP[color.toLowerCase()] || '#6b7280';
};

// Formatear montos: $4.230.808
const formatearMonto = (monto) => {
  if (monto === null || monto === undefined) return '-';
  return `$${Math.round(monto).toLocaleString('es-AR')}`;
};

// Formatear fecha: 2026-02-12 -> 12/02/2026
const formatearFecha = (fechaStr) => {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr + 'T00:00:00');
  return fecha.toLocaleDateString('es-AR');
};

// Capitalizar mes: "marzo" -> "Marzo"
const capitalizarMes = (mes) => {
  if (!mes) return '';
  return mes.charAt(0).toUpperCase() + mes.slice(1);
};

// Mapeo de meses abreviados inglés a español completo
const MESES_MAP = {
  'jan': 'Enero', 'feb': 'Febrero', 'mar': 'Marzo', 'apr': 'Abril',
  'may': 'Mayo', 'jun': 'Junio', 'jul': 'Julio', 'aug': 'Agosto',
  'sep': 'Septiembre', 'oct': 'Octubre', 'nov': 'Noviembre', 'dec': 'Diciembre'
};

// Formatear mes: "jan/25" -> "Enero 2025"
const formatearMesAnio = (mesAbrev) => {
  if (!mesAbrev) return '-';
  const [mes, anio] = mesAbrev.split('/');
  const mesEspanol = MESES_MAP[mes.toLowerCase()] || mes;
  const anioCompleto = anio ? `20${anio}` : '';
  return `${mesEspanol} ${anioCompleto}`;
};

export default function ReportesFinancieros() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Fechas por defecto: último año
  const hoy = new Date();
  const haceUnAno = new Date(hoy);
  haceUnAno.setFullYear(haceUnAno.getFullYear() - 1);

  const [filtros, setFiltros] = useState({
    fecha_desde: haceUnAno.toISOString().split('T')[0],
    fecha_hasta: hoy.toISOString().split('T')[0],
    local_id: ''
  });

  // Estado para filtro de mes en Resumen de Eventos (debe estar antes de cualquier return)
  const [filtroMesResumen, setFiltroMesResumen] = useState('');

  useEffect(() => {
    cargarReportes();
  }, []);

  const cargarReportes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde);
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta);
      if (filtros.local_id) params.append('local_id', filtros.local_id);

      const response = await api.get(`/reportes/financiero?${params.toString()}`);
      setData(response.data);
    } catch (error) {
      console.error('Error cargando reportes financieros:', error);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltros = () => {
    cargarReportes();
  };

  if (loading) {
    return <div className="reportes-loading">Cargando reportes financieros...</div>;
  }

  if (!data) {
    return <div className="reportes-error">Error al cargar reportes</div>;
  }

  const { flujo_pagos, resumen_saldos, locales, canales_local } = data;

  // Obtener meses únicos de los eventos para el filtro
  const mesesDisponibles = [...new Set(resumen_saldos.filas.map(f => f.mes_evento))].filter(m => m);

  // Filtrar filas del resumen por mes seleccionado
  const filasFiltradas = filtroMesResumen
    ? resumen_saldos.filas.filter(f => f.mes_evento === filtroMesResumen)
    : resumen_saldos.filas;

  // Recalcular totales para las filas filtradas
  const totalesFiltrados = filtroMesResumen ? {
    monto_evento: filasFiltradas.reduce((sum, f) => sum + f.monto_evento, 0),
    monto_abonado: filasFiltradas.reduce((sum, f) => sum + f.monto_abonado, 0),
    restante: filasFiltradas.reduce((sum, f) => sum + f.restante, 0),
    cantidad_eventos: filasFiltradas.length,
    cantidad_saldados: filasFiltradas.filter(f => f.estado_saldo === 'Evento saldado').length,
    cantidad_pendientes: filasFiltradas.filter(f => f.estado_saldo === 'Pagos pendientes').length
  } : resumen_saldos.totales;

  // Calcular máximo para barras proporcionales de canales
  const maxCanal = canales_local?.filas?.length > 0
    ? Math.max(...canales_local.filas.map(f => f.total), 1)
    : 1;

  return (
    <div className="reportes-financieros-container">
      {/* Header con filtros */}
      <div className="rf-header">
        <div className="rf-header-titulo">
          <h1>Reportes Financieros</h1>
          <span className="rf-subtitulo">Información financiera para la dirección</span>
        </div>
        <div className="rf-filtros">
          <div className="rf-filtro-grupo">
            <label>Desde</label>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
            />
          </div>
          <div className="rf-filtro-grupo">
            <label>Hasta</label>
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
            />
          </div>
          <div className="rf-filtro-grupo">
            <label>Local</label>
            <select
              value={filtros.local_id}
              onChange={(e) => setFiltros({ ...filtros, local_id: e.target.value })}
            >
              <option value="">Todos los locales</option>
              {locales.map(local => (
                <option key={local.id} value={local.id}>{local.nombre}</option>
              ))}
            </select>
          </div>
          <button className="rf-btn-aplicar" onClick={aplicarFiltros}>
            Aplicar
          </button>
        </div>
      </div>

      {/* KPIs Financieros */}
      <div className="rf-kpis">
        <div className="rf-kpi-card">
          <span className="rf-kpi-valor">{formatearMonto(resumen_saldos.totales.monto_evento)}</span>
          <span className="rf-kpi-label">Total Facturado</span>
        </div>
        <div className="rf-kpi-card success">
          <span className="rf-kpi-valor">{formatearMonto(resumen_saldos.totales.monto_abonado)}</span>
          <span className="rf-kpi-label">Total Cobrado</span>
        </div>
        <div className="rf-kpi-card warning">
          <span className="rf-kpi-valor">{formatearMonto(resumen_saldos.totales.restante)}</span>
          <span className="rf-kpi-label">Pendiente de Cobro</span>
        </div>
        <div className="rf-kpi-card info">
          <span className="rf-kpi-valor">{resumen_saldos.totales.cantidad_eventos}</span>
          <span className="rf-kpi-label">Eventos</span>
        </div>
        <div className="rf-kpi-card success-light">
          <span className="rf-kpi-valor">{resumen_saldos.totales.cantidad_saldados}</span>
          <span className="rf-kpi-label">Saldados</span>
        </div>
        <div className="rf-kpi-card warning-light">
          <span className="rf-kpi-valor">{resumen_saldos.totales.cantidad_pendientes}</span>
          <span className="rf-kpi-label">Con Pagos Pendientes</span>
        </div>
      </div>

      {/* REPORTE 1: Flujo de Pagos */}
      <div className="rf-seccion">
        <div className="rf-seccion-header">
          <h2>Flujo de Pagos por Mes</h2>
          <p className="rf-seccion-desc">
            Muestra el monto de los eventos por mes y cuándo se recibieron los pagos
          </p>
        </div>
        <div className="rf-tabla-container">
          <table className="rf-tabla flujo-pagos">
            <thead>
              <tr>
                <th className="col-mes-evento">Mes Evento</th>
                <th className="col-total-evento">Total Evento</th>
                {flujo_pagos.columnas_pago.map(col => (
                  <th key={col} className="col-pago">{formatearMesAnio(col)}</th>
                ))}
                <th className="col-total-pagado">Total Pagado</th>
              </tr>
            </thead>
            <tbody>
              {flujo_pagos.filas.length === 0 ? (
                <tr>
                  <td colSpan={3 + flujo_pagos.columnas_pago.length} className="sin-datos">
                    No hay datos para el período seleccionado
                  </td>
                </tr>
              ) : (
                flujo_pagos.filas.map((fila, idx) => (
                  <tr key={idx}>
                    <td className="col-mes-evento">{formatearMesAnio(fila.mes_evento)}</td>
                    <td className="col-total-evento">{formatearMonto(fila.total_evento)}</td>
                    {flujo_pagos.columnas_pago.map(col => (
                      <td key={col} className="col-pago">
                        {fila.pagos[col] > 0 ? formatearMonto(fila.pagos[col]) : ''}
                      </td>
                    ))}
                    <td className="col-total-pagado">{formatearMonto(fila.total_pagado)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {flujo_pagos.filas.length > 0 && (
              <tfoot>
                <tr className="fila-totales">
                  <td className="col-mes-evento"><strong>Total</strong></td>
                  <td className="col-total-evento"><strong>{formatearMonto(flujo_pagos.total_general_eventos)}</strong></td>
                  {flujo_pagos.columnas_pago.map(col => (
                    <td key={col} className="col-pago">
                      <strong>{flujo_pagos.totales_por_mes_pago[col] > 0 ? formatearMonto(flujo_pagos.totales_por_mes_pago[col]) : ''}</strong>
                    </td>
                  ))}
                  <td className="col-total-pagado"><strong>{formatearMonto(flujo_pagos.total_general_pagado)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* REPORTE 2: Resumen de Saldos */}
      <div className="rf-seccion">
        <div className="rf-seccion-header">
          <div className="rf-seccion-header-left">
            <h2>Resumen de Eventos</h2>
            <p className="rf-seccion-desc">
              Estado de saldo de cada evento - Monto total, pagado y pendiente
            </p>
          </div>
          <div className="rf-seccion-filtro">
            <label>Filtrar por mes:</label>
            <select
              value={filtroMesResumen}
              onChange={(e) => setFiltroMesResumen(e.target.value)}
            >
              <option value="">Todos los meses</option>
              {mesesDisponibles.map(mes => (
                <option key={mes} value={mes}>{capitalizarMes(mes)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rf-tabla-container">
          <table className="rf-tabla resumen-saldos">
            <thead>
              <tr>
                <th className="col-local">Local</th>
                <th className="col-id">N° Evento</th>
                <th className="col-cliente">Nombre Evento</th>
                <th className="col-fecha">Fecha Evento</th>
                <th className="col-mes">Mes</th>
                <th className="col-monto">Monto Evento</th>
                <th className="col-monto">Monto Abonado</th>
                <th className="col-monto">Restante</th>
                <th className="col-estado">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan="9" className="sin-datos">
                    No hay eventos para el período seleccionado
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((fila) => (
                  <tr key={fila.id} className={fila.estado_saldo === 'Evento saldado' ? 'fila-saldado' : fila.estado_saldo === 'Pagos pendientes' ? 'fila-pendiente' : ''}>
                    <td className="col-local">{fila.local}</td>
                    <td className="col-id">{fila.id}</td>
                    <td className="col-cliente">{fila.cliente}</td>
                    <td className="col-fecha">{formatearFecha(fila.fecha_evento)}</td>
                    <td className="col-mes">{capitalizarMes(fila.mes_evento)}</td>
                    <td className="col-monto">{formatearMonto(fila.monto_evento)}</td>
                    <td className="col-monto">{formatearMonto(fila.monto_abonado)}</td>
                    <td className="col-monto restante">
                      {fila.restante > 0 ? formatearMonto(fila.restante) : '0'}
                    </td>
                    <td className="col-estado">
                      <span className={`badge-estado-saldo ${fila.estado_saldo === 'Evento saldado' ? 'saldado' : fila.estado_saldo === 'Pagos pendientes' ? 'pendiente' : 'sin-presupuesto'}`}>
                        {fila.estado_saldo}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filasFiltradas.length > 0 && (
              <tfoot>
                <tr className="fila-totales">
                  <td colSpan="5"><strong>TOTAL{filtroMesResumen ? ` (${capitalizarMes(filtroMesResumen)})` : ''}</strong></td>
                  <td className="col-monto"><strong>{formatearMonto(totalesFiltrados.monto_evento)}</strong></td>
                  <td className="col-monto"><strong>{formatearMonto(totalesFiltrados.monto_abonado)}</strong></td>
                  <td className="col-monto restante"><strong>{formatearMonto(totalesFiltrados.restante)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* REPORTE 3: Canales de Origen por Local */}
      {canales_local && (
        <div className="rf-seccion">
          <div className="rf-seccion-header">
            <h2>Canales de Origen por Local</h2>
            <p className="rf-seccion-desc">
              De dónde vienen las consultas (Instagram, mail, web, etc.) y cómo se distribuyen entre los locales
            </p>
          </div>
          <div className="rf-tabla-container">
            <table className="rf-tabla canales-origen">
              <thead>
                <tr>
                  <th className="col-canal">Canal</th>
                  <th className="col-total">Total</th>
                  <th className="col-porcentaje">%</th>
                  {canales_local.locales.map(local => (
                    <th key={local.id} className="col-local" style={{ borderBottomColor: getColorHex(local.color) }}>
                      {local.nombre}
                    </th>
                  ))}
                  <th className="col-bar">Distribución</th>
                </tr>
              </thead>
              <tbody>
                {canales_local.filas.length === 0 ? (
                  <tr>
                    <td colSpan={4 + canales_local.locales.length} className="sin-datos">
                      No hay datos para el período seleccionado
                    </td>
                  </tr>
                ) : (
                  canales_local.filas.map((fila, idx) => (
                    <tr key={idx}>
                      <td className="col-canal">{fila.canal}</td>
                      <td className="col-total">{fila.total}</td>
                      <td className="col-porcentaje">{fila.porcentaje}%</td>
                      {canales_local.locales.map(local => (
                        <td key={local.id} className="col-local-data">
                          <span className="cantidad">{fila.locales[local.id]?.cantidad || 0}</span>
                          <span className="porcentaje-mini">
                            {fila.locales[local.id]?.porcentaje || 0}%
                          </span>
                        </td>
                      ))}
                      <td className="col-bar">
                        <div className="bar-container">
                          <div
                            className="bar"
                            style={{ width: `${(fila.total / maxCanal) * 100}%` }}
                          >
                            {canales_local.locales.map(local => {
                              const cantidad = fila.locales[local.id]?.cantidad || 0;
                              if (cantidad === 0) return null;
                              return (
                                <div
                                  key={local.id}
                                  className="bar-segment"
                                  style={{
                                    width: `${(cantidad / fila.total) * 100}%`,
                                    backgroundColor: getColorHex(local.color)
                                  }}
                                ></div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {canales_local.filas.length > 0 && (
                <tfoot>
                  <tr className="fila-totales">
                    <td className="col-canal"><strong>TOTAL</strong></td>
                    <td className="col-total"><strong>{canales_local.total_general}</strong></td>
                    <td className="col-porcentaje"><strong>100%</strong></td>
                    {canales_local.locales.map(local => (
                      <td key={local.id}><strong>{canales_local.totales_por_local[local.id] || 0}</strong></td>
                    ))}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
