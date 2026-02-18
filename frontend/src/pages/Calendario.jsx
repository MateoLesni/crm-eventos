import { useState, useEffect, useMemo } from 'react';
import './Calendario.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Nombres de meses en español
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Colores por local (fallback)
const COLORES_LOCAL = {
  'verde': '#10b981',
  'azul': '#3b82f6',
  'rojo': '#ef4444',
  'naranja': '#f97316',
  'morado': '#8b5cf6',
  'rosa': '#ec4899',
  'cyan': '#06b6d4',
  'amarillo': '#eab308'
};

const getColorLocal = (color) => {
  if (!color) return '#6b7280';
  if (color.startsWith('#')) return color;
  return COLORES_LOCAL[color.toLowerCase()] || '#6b7280';
};

export default function Calendario() {
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState([]);
  const [locales, setLocales] = useState([]);
  const [vista, setVista] = useState('general'); // 'general' | 'por-local'
  const [localSeleccionado, setLocalSeleccionado] = useState(null);
  const [mesActual, setMesActual] = useState(new Date());
  const [eventoHover, setEventoHover] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Cargar eventos y locales en paralelo
      const [eventosRes, localesRes] = await Promise.all([
        fetch(`${API_URL}/calendario/eventos`, { headers }),
        fetch(`${API_URL}/locales`, { headers })
      ]);

      if (eventosRes.ok) {
        const eventosData = await eventosRes.json();
        setEventos(eventosData);
      }

      if (localesRes.ok) {
        const localesData = await localesRes.json();
        setLocales(localesData);
      }
    } catch (error) {
      console.error('Error cargando datos del calendario:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generar días del mes
  const diasDelMes = useMemo(() => {
    const año = mesActual.getFullYear();
    const mes = mesActual.getMonth();

    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);

    const dias = [];

    // Días del mes anterior para completar la primera semana
    const primerDiaSemana = primerDia.getDay();
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      const fecha = new Date(año, mes, -i);
      dias.push({ fecha, esOtroMes: true });
    }

    // Días del mes actual
    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const fecha = new Date(año, mes, dia);
      dias.push({ fecha, esOtroMes: false });
    }

    // Días del mes siguiente para completar la última semana
    const diasRestantes = 42 - dias.length; // 6 semanas * 7 días
    for (let i = 1; i <= diasRestantes; i++) {
      const fecha = new Date(año, mes + 1, i);
      dias.push({ fecha, esOtroMes: true });
    }

    return dias;
  }, [mesActual]);

  // Agrupar eventos por fecha
  const eventosPorFecha = useMemo(() => {
    const mapa = {};

    eventos.forEach(evento => {
      if (!evento.fecha_evento) return;

      // Filtrar por local si está seleccionado
      if (vista === 'por-local' && localSeleccionado && evento.local_id !== localSeleccionado) {
        return;
      }

      const fechaKey = evento.fecha_evento.split('T')[0];
      if (!mapa[fechaKey]) {
        mapa[fechaKey] = [];
      }
      mapa[fechaKey].push(evento);
    });

    return mapa;
  }, [eventos, vista, localSeleccionado]);

  // Navegar entre meses
  const mesAnterior = () => {
    setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1));
  };

  const mesSiguiente = () => {
    setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1));
  };

  const irAHoy = () => {
    setMesActual(new Date());
  };

  // Verificar si una fecha tiene eventos aprobados
  const tieneEventoAprobado = (fechaKey) => {
    const eventosDelDia = eventosPorFecha[fechaKey] || [];
    return eventosDelDia.some(e => e.estado === 'APROBADO' || e.estado === 'CONCLUIDO');
  };

  // Formatear fecha para mostrar
  const formatearFecha = (fecha) => {
    return fecha.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  if (loading) {
    return <div className="calendario-loading">Cargando calendario...</div>;
  }

  return (
    <div className="calendario-container">
      {/* Header */}
      <div className="calendario-header">
        <div className="calendario-titulo">
          <h1>Calendario de Eventos</h1>
          <span className="calendario-subtitulo">
            Eventos cotizados y aprobados
          </span>
        </div>

        <div className="calendario-controles">
          {/* Selector de vista */}
          <div className="vista-selector">
            <button
              className={`vista-btn ${vista === 'general' ? 'active' : ''}`}
              onClick={() => {
                setVista('general');
                setLocalSeleccionado(null);
              }}
            >
              Vista General
            </button>
            <button
              className={`vista-btn ${vista === 'por-local' ? 'active' : ''}`}
              onClick={() => setVista('por-local')}
            >
              Por Local
            </button>
          </div>

          {/* Selector de local (solo en vista por local) */}
          {vista === 'por-local' && (
            <select
              className="local-selector"
              value={localSeleccionado || ''}
              onChange={(e) => setLocalSeleccionado(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">Todos los locales</option>
              {locales.map(local => (
                <option key={local.id} value={local.id}>{local.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Navegación del mes */}
      <div className="calendario-nav">
        <button className="nav-btn" onClick={mesAnterior}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="mes-actual">
          <h2>{MESES[mesActual.getMonth()]} {mesActual.getFullYear()}</h2>
          <button className="btn-hoy" onClick={irAHoy}>Hoy</button>
        </div>

        <button className="nav-btn" onClick={mesSiguiente}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Leyenda */}
      <div className="calendario-leyenda">
        <div className="leyenda-item">
          <span className="leyenda-dot cotizado"></span>
          <span>Cotizado</span>
        </div>
        <div className="leyenda-item">
          <span className="leyenda-dot aprobado"></span>
          <span>Aprobado</span>
        </div>
        {vista === 'general' && locales.map(local => (
          <div key={local.id} className="leyenda-item">
            <span
              className="leyenda-dot local"
              style={{ backgroundColor: getColorLocal(local.color) }}
            ></span>
            <span>{local.nombre}</span>
          </div>
        ))}
      </div>

      {/* Grilla del calendario */}
      <div className="calendario-grilla">
        {/* Encabezados de días */}
        <div className="calendario-dias-header">
          {DIAS_SEMANA.map(dia => (
            <div key={dia} className="dia-header">{dia}</div>
          ))}
        </div>

        {/* Días del mes */}
        <div className="calendario-dias">
          {diasDelMes.map(({ fecha, esOtroMes }, index) => {
            const fechaKey = fecha.toISOString().split('T')[0];
            const eventosDelDia = eventosPorFecha[fechaKey] || [];
            const esHoy = fecha.toDateString() === new Date().toDateString();
            const hayAprobado = tieneEventoAprobado(fechaKey);

            return (
              <div
                key={index}
                className={`calendario-dia ${esOtroMes ? 'otro-mes' : ''} ${esHoy ? 'hoy' : ''} ${hayAprobado ? 'con-aprobado' : ''}`}
              >
                <div className="dia-numero">{fecha.getDate()}</div>

                <div className="dia-eventos">
                  {eventosDelDia.slice(0, 3).map(evento => (
                    <div
                      key={evento.id}
                      className={`evento-chip ${evento.estado === 'APROBADO' || evento.estado === 'CONCLUIDO' ? 'aprobado' : 'cotizado'}`}
                      style={{
                        borderLeftColor: getColorLocal(evento.local_color),
                        backgroundColor: evento.estado === 'APROBADO' || evento.estado === 'CONCLUIDO'
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(245, 158, 11, 0.1)'
                      }}
                      onMouseEnter={() => setEventoHover(evento)}
                      onMouseLeave={() => setEventoHover(null)}
                    >
                      <span className="evento-hora">
                        {evento.hora_inicio || '--:--'}
                      </span>
                      <span className="evento-nombre" title={evento.cliente_nombre}>
                        {evento.cliente_nombre?.substring(0, 15) || 'Sin nombre'}
                        {evento.cliente_nombre?.length > 15 ? '...' : ''}
                      </span>
                    </div>
                  ))}

                  {eventosDelDia.length > 3 && (
                    <div className="eventos-mas">
                      +{eventosDelDia.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip de evento */}
      {eventoHover && (
        <div className="evento-tooltip">
          <div className="tooltip-header">
            <span
              className="tooltip-local"
              style={{ backgroundColor: getColorLocal(eventoHover.local_color) }}
            >
              {eventoHover.local_nombre}
            </span>
            <span className={`tooltip-estado ${eventoHover.estado === 'APROBADO' || eventoHover.estado === 'CONCLUIDO' ? 'aprobado' : 'cotizado'}`}>
              {eventoHover.estado}
            </span>
          </div>
          <div className="tooltip-cliente">{eventoHover.cliente_nombre}</div>
          <div className="tooltip-detalles">
            <div><strong>Fecha:</strong> {formatearFecha(new Date(eventoHover.fecha_evento))}</div>
            <div><strong>Horario:</strong> {eventoHover.hora_inicio || '--:--'} - {eventoHover.hora_fin || '--:--'}</div>
            {eventoHover.cantidad_personas && (
              <div><strong>Personas:</strong> {eventoHover.cantidad_personas}</div>
            )}
            {eventoHover.tipo_evento && (
              <div><strong>Tipo:</strong> {eventoHover.tipo_evento}</div>
            )}
          </div>
        </div>
      )}

      {/* Resumen del mes */}
      <div className="calendario-resumen">
        <div className="resumen-card">
          <span className="resumen-numero">
            {Object.values(eventosPorFecha).flat().filter(e => e.estado === 'COTIZADO').length}
          </span>
          <span className="resumen-label">Cotizados</span>
        </div>
        <div className="resumen-card aprobados">
          <span className="resumen-numero">
            {Object.values(eventosPorFecha).flat().filter(e => e.estado === 'APROBADO' || e.estado === 'CONCLUIDO').length}
          </span>
          <span className="resumen-label">Aprobados</span>
        </div>
        <div className="resumen-card total">
          <span className="resumen-numero">
            {Object.values(eventosPorFecha).flat().length}
          </span>
          <span className="resumen-label">Total del mes</span>
        </div>
      </div>
    </div>
  );
}
