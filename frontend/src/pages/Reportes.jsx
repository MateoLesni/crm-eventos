import { useState, useEffect } from 'react';
import api from '../services/api';
import './Reportes.css';

// Formatear montos grandes: $4.230.808 -> $4.2M
const formatearMonto = (monto) => {
  if (monto >= 1000000) {
    return `$${(monto / 1000000).toFixed(1)}M`;
  }
  if (monto >= 1000) {
    return `$${(monto / 1000).toFixed(0)}K`;
  }
  return `$${monto.toLocaleString()}`;
};

// Formatear fecha: 2026-02-12 -> 12 Feb
const formatearFecha = (fechaStr) => {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr + 'T00:00:00');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
};

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Fechas por defecto: últimos 30 días
  const hoy = new Date();
  const hace30Dias = new Date(hoy);
  hace30Dias.setDate(hace30Dias.getDate() - 30);

  const [filtros, setFiltros] = useState({
    fecha_desde: hace30Dias.toISOString().split('T')[0],
    fecha_hasta: hoy.toISOString().split('T')[0],
    agrupacion: 'diario'
  });

  useEffect(() => {
    cargarReportes();
  }, []);

  const cargarReportes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde);
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta);
      params.append('agrupacion', filtros.agrupacion);

      const response = await api.get(`/reportes?${params.toString()}`);
      setData(response.data);
    } catch (error) {
      console.error('Error cargando reportes:', error);
    } finally {
      setLoading(false);
    }
  };

  const aplicarFiltros = () => {
    cargarReportes();
  };

  if (loading) {
    return <div className="reportes-loading">Cargando reportes...</div>;
  }

  if (!data) {
    return <div className="reportes-error">Error al cargar reportes</div>;
  }

  const { kpis, volumen_periodo, comerciales } = data;

  // Calcular máximo para barras proporcionales
  const maxVolumen = Math.max(...volumen_periodo.filas.map(f => f.total), 1);
  const maxComercial = Math.max(...comerciales.filas.map(f => f.total), 1);

  // Período mostrado
  const periodoTexto = `${formatearFecha(filtros.fecha_desde)} - ${formatearFecha(filtros.fecha_hasta)}`;

  return (
    <div className="reportes-container">
      {/* Header con filtros */}
      <div className="reportes-header">
        <div className="header-titulo">
          <h1>Dashboard de Reportes</h1>
          <span className="periodo-badge">{periodoTexto}</span>
        </div>
        <div className="reportes-filtros">
          <div className="filtro-grupo">
            <label>Desde</label>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
            />
          </div>
          <div className="filtro-grupo">
            <label>Hasta</label>
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
            />
          </div>
          <div className="filtro-grupo">
            <label>Agrupar</label>
            <select
              value={filtros.agrupacion}
              onChange={(e) => setFiltros({ ...filtros, agrupacion: e.target.value })}
            >
              <option value="diario">Por día</option>
              <option value="semanal">Por semana</option>
            </select>
          </div>
          <button className="btn-aplicar" onClick={aplicarFiltros}>
            Aplicar
          </button>
        </div>
      </div>

      {/* SECCIÓN 1: ESTADO ACTUAL (foto instantánea) */}
      <div className="kpis-section">
        <div className="seccion-titulo-kpis">
          <h2>Estado Actual</h2>
          <span className="seccion-nota">Foto instantánea del sistema - No cambia con filtros de fecha</span>
        </div>
        <div className="kpis-row">
          <div className="kpi-card urgente">
            <span className="kpi-valor">{kpis.estado_actual.sin_asignar}</span>
            <span className="kpi-label">Sin Asignar</span>
            <span className="kpi-desc">Consultas entrantes sin comercial</span>
          </div>
          <div className="kpi-card pendiente">
            <span className="kpi-valor">{kpis.estado_actual.cotizados_abiertos}</span>
            <span className="kpi-label">Cotizados Abiertos</span>
            <span className="kpi-desc">Esperando respuesta del cliente</span>
          </div>
          <div className="kpi-card dinero">
            <span className="kpi-valor">{formatearMonto(kpis.estado_actual.monto_en_negociacion)}</span>
            <span className="kpi-label">En Negociación</span>
            <span className="kpi-desc">Monto de cotizaciones abiertas</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: EN EL PERÍODO (filtrado por fechas) */}
      <div className="kpis-section">
        <div className="seccion-titulo-kpis">
          <h2>En el Período</h2>
          <span className="seccion-nota periodo">{periodoTexto} - Cambia según filtros de fecha</span>
        </div>
        <div className="kpis-row">
          <div className="kpi-card neutro">
            <span className="kpi-valor">{kpis.en_periodo.solicitudes}</span>
            <span className="kpi-label">Solicitudes</span>
            <span className="kpi-desc">Consultas ingresadas</span>
          </div>
          <div className="kpi-card exito">
            <span className="kpi-valor">{kpis.en_periodo.cerrados}</span>
            <span className="kpi-label">Cerrados</span>
            <span className="kpi-desc">Eventos confirmados</span>
          </div>
          <div className="kpi-card perdido">
            <span className="kpi-valor">{kpis.en_periodo.perdidos}</span>
            <span className="kpi-label">Perdidos</span>
            <span className="kpi-desc">Oportunidades no concretadas</span>
          </div>
          <div className="kpi-card tasa">
            <span className="kpi-valor">{kpis.en_periodo.tasa_cierre}%</span>
            <span className="kpi-label">Tasa de Cierre</span>
            <span className="kpi-desc">Cerrados / (Cerrados + Perdidos)</span>
          </div>
          <div className="kpi-card dinero-exito">
            <span className="kpi-valor">{formatearMonto(kpis.en_periodo.monto_cerrado)}</span>
            <span className="kpi-label">Facturación Cerrada</span>
            <span className="kpi-desc">Monto aprobado en el período</span>
          </div>
        </div>
      </div>

      {/* Volumen por Período */}
      <div className="reporte-seccion">
        <div className="seccion-header">
          <h2>Volumen de Solicitudes</h2>
          <p className="seccion-desc">
            Muestra cuántas consultas ingresaron cada {filtros.agrupacion === 'semanal' ? 'semana' : 'día'} y en qué estado se encuentran actualmente.
          </p>
        </div>
        <div className="tabla-container">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Entrante</th>
                <th>Asignado</th>
                <th>Contactado</th>
                <th>Cotizado</th>
                <th className="col-success">Aprobado</th>
                <th className="col-danger">Rechazado</th>
                <th>Total</th>
                <th className="col-bar">Distribución</th>
              </tr>
            </thead>
            <tbody>
              {volumen_periodo.filas.length === 0 ? (
                <tr>
                  <td colSpan="9" className="sin-datos">No hay datos para el período seleccionado</td>
                </tr>
              ) : (
                volumen_periodo.filas.map((fila, idx) => (
                  <tr key={idx}>
                    <td className="fecha">{formatearFecha(fila.fecha)}</td>
                    <td>{fila.consulta_entrante}</td>
                    <td>{fila.asignado}</td>
                    <td>{fila.contactado}</td>
                    <td>{fila.cotizado}</td>
                    <td className="success">{fila.aprobado}</td>
                    <td className="danger">{fila.rechazado}</td>
                    <td className="total">{fila.total}</td>
                    <td className="col-bar">
                      <div className="bar-container">
                        <div
                          className="bar"
                          style={{ width: `${(fila.total / maxVolumen) * 100}%` }}
                        >
                          {fila.consulta_entrante > 0 && <div className="bar-segment entrante" style={{ width: `${(fila.consulta_entrante / fila.total) * 100}%` }}></div>}
                          {fila.asignado > 0 && <div className="bar-segment asignado" style={{ width: `${(fila.asignado / fila.total) * 100}%` }}></div>}
                          {fila.contactado > 0 && <div className="bar-segment contactado" style={{ width: `${(fila.contactado / fila.total) * 100}%` }}></div>}
                          {fila.cotizado > 0 && <div className="bar-segment cotizado" style={{ width: `${(fila.cotizado / fila.total) * 100}%` }}></div>}
                          {fila.aprobado > 0 && <div className="bar-segment aprobado" style={{ width: `${(fila.aprobado / fila.total) * 100}%` }}></div>}
                          {fila.rechazado > 0 && <div className="bar-segment rechazado" style={{ width: `${(fila.rechazado / fila.total) * 100}%` }}></div>}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {volumen_periodo.filas.length > 1 && (
              <tfoot>
                <tr className="fila-totales">
                  <td>TOTAL</td>
                  <td>{volumen_periodo.totales.consulta_entrante}</td>
                  <td>{volumen_periodo.totales.asignado}</td>
                  <td>{volumen_periodo.totales.contactado}</td>
                  <td>{volumen_periodo.totales.cotizado}</td>
                  <td className="success">{volumen_periodo.totales.aprobado}</td>
                  <td className="danger">{volumen_periodo.totales.rechazado}</td>
                  <td className="total">{volumen_periodo.totales.total}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Comerciales */}
      <div className="reporte-seccion">
        <div className="seccion-header">
          <h2>Rendimiento por Comercial</h2>
          <p className="seccion-desc">
            Carga de trabajo y resultados de cada comercial. La barra muestra la proporción de eventos en cada estado.
          </p>
        </div>
        <div className="tabla-container">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th>Comercial</th>
                <th>Entrante</th>
                <th>Asignado</th>
                <th>Contactado</th>
                <th>Cotizado</th>
                <th className="col-success">Aprobado</th>
                <th className="col-danger">Rechazado</th>
                <th>Total</th>
                <th>Part.</th>
                <th className="col-bar">Composición</th>
              </tr>
            </thead>
            <tbody>
              {comerciales.filas.map((fila, idx) => (
                <tr key={idx} className={fila.comercial_id === null ? 'fila-sin-asignar' : ''}>
                  <td className="comercial">{fila.nombre}</td>
                  <td>{fila.consulta_entrante}</td>
                  <td>{fila.asignado}</td>
                  <td>{fila.contactado}</td>
                  <td>{fila.cotizado}</td>
                  <td className="success">{fila.aprobado}</td>
                  <td className="danger">{fila.rechazado}</td>
                  <td className="total">{fila.total}</td>
                  <td className="porcentaje">{fila.participacion}%</td>
                  <td className="col-bar">
                    {fila.total > 0 && (
                      <div className="bar-container">
                        <div
                          className="bar"
                          style={{ width: `${(fila.total / maxComercial) * 100}%` }}
                        >
                          {fila.aprobado > 0 && <div className="bar-segment aprobado" style={{ width: `${(fila.aprobado / fila.total) * 100}%` }}></div>}
                          {fila.cotizado > 0 && <div className="bar-segment cotizado" style={{ width: `${(fila.cotizado / fila.total) * 100}%` }}></div>}
                          {fila.contactado > 0 && <div className="bar-segment contactado" style={{ width: `${(fila.contactado / fila.total) * 100}%` }}></div>}
                          {fila.asignado > 0 && <div className="bar-segment asignado" style={{ width: `${(fila.asignado / fila.total) * 100}%` }}></div>}
                          {fila.consulta_entrante > 0 && <div className="bar-segment entrante" style={{ width: `${(fila.consulta_entrante / fila.total) * 100}%` }}></div>}
                          {fila.rechazado > 0 && <div className="bar-segment rechazado" style={{ width: `${(fila.rechazado / fila.total) * 100}%` }}></div>}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fila-totales">
                <td>TOTAL</td>
                <td>{comerciales.totales.consulta_entrante}</td>
                <td>{comerciales.totales.asignado}</td>
                <td>{comerciales.totales.contactado}</td>
                <td>{comerciales.totales.cotizado}</td>
                <td className="success">{comerciales.totales.aprobado}</td>
                <td className="danger">{comerciales.totales.rechazado}</td>
                <td className="total">{comerciales.totales.total}</td>
                <td>100%</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Leyenda de estados */}
      <div className="leyenda">
        <span className="leyenda-titulo">Estados:</span>
        <span className="leyenda-item"><span className="dot entrante"></span> Entrante</span>
        <span className="leyenda-item"><span className="dot asignado"></span> Asignado</span>
        <span className="leyenda-item"><span className="dot contactado"></span> Contactado</span>
        <span className="leyenda-item"><span className="dot cotizado"></span> Cotizado</span>
        <span className="leyenda-item"><span className="dot aprobado"></span> Aprobado</span>
        <span className="leyenda-item"><span className="dot rechazado"></span> Rechazado</span>
      </div>
    </div>
  );
}
