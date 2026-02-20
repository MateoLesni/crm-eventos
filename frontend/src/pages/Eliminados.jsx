import { useState, useEffect, useMemo } from 'react';
import { eventosApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Eliminados.css';
import '../components/Modal.css';

const LOCALES = [
  { id: 1, nombre: 'Costa7070' },
  { id: 2, nombre: 'Kona' },
  { id: 3, nombre: 'MilVidas' },
  { id: 4, nombre: 'CoChinChina' },
  { id: 5, nombre: 'Cruza Polo' },
  { id: 6, nombre: 'Cruza Recoleta' },
  { id: 7, nombre: 'La Mala' },
];

const formatearFecha = (fechaStr) => {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr);
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Eliminados() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restaurando, setRestaurando] = useState(null);
  const [showConfirmar, setShowConfirmar] = useState(null);
  const { usuario } = useAuth();
  const isAdmin = usuario?.rol === 'admin';

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  const [filtroComercial, setFiltroComercial] = useState('');

  useEffect(() => {
    cargarEliminados();
  }, []);

  const cargarEliminados = async () => {
    try {
      const res = await eventosApi.listarEliminados();
      setEventos(res.data.eventos);
    } catch (error) {
      console.error('Error cargando eliminados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extraer comerciales únicos de los eventos
  const comerciales = useMemo(() => {
    const map = new Map();
    eventos.forEach(e => {
      if (e.comercial?.id && e.comercial?.nombre) {
        map.set(e.comercial.id, e.comercial.nombre);
      }
    });
    return Array.from(map, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [eventos]);

  // Estados previos únicos
  const estadosPrevios = useMemo(() => {
    const set = new Set();
    eventos.forEach(e => { if (e.estado_pre_eliminacion) set.add(e.estado_pre_eliminacion); });
    return Array.from(set).sort();
  }, [eventos]);

  // Filtrado
  const eventosFiltrados = useMemo(() => {
    let resultado = [...eventos];
    if (busqueda) {
      const q = busqueda.toLowerCase();
      resultado = resultado.filter(e =>
        (e.cliente?.nombre || '').toLowerCase().includes(q) ||
        (e.cliente?.telefono || '').toLowerCase().includes(q) ||
        (e.titulo_display || '').toLowerCase().includes(q) ||
        (e.motivo_eliminacion || '').toLowerCase().includes(q)
      );
    }
    if (filtroEstado) {
      resultado = resultado.filter(e => e.estado_pre_eliminacion === filtroEstado);
    }
    if (filtroLocal) {
      resultado = resultado.filter(e => e.local?.id === parseInt(filtroLocal));
    }
    if (filtroComercial) {
      resultado = resultado.filter(e => e.comercial?.id === parseInt(filtroComercial));
    }
    return resultado;
  }, [eventos, busqueda, filtroEstado, filtroLocal, filtroComercial]);

  const hayFiltrosActivos = busqueda || filtroEstado || filtroLocal || filtroComercial;

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroLocal('');
    setFiltroComercial('');
  };

  const handleRestaurar = async (eventoId) => {
    setRestaurando(eventoId);
    try {
      await eventosApi.actualizar(eventoId, { estado: 'REVERTIR_ESTADO' });
      setShowConfirmar(null);
      cargarEliminados();
    } catch (error) {
      console.error('Error restaurando evento:', error);
      alert(error.response?.data?.error || 'Error al restaurar evento');
    } finally {
      setRestaurando(null);
    }
  };

  if (loading) {
    return (
      <div className="eliminados-page">
        <div className="eliminados-loading">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="eliminados-page">
      <div className="eliminados-header">
        <div className="eliminados-header-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span>
            {hayFiltrosActivos
              ? `${eventosFiltrados.length} de ${eventos.length} evento${eventos.length !== 1 ? 's' : ''}`
              : `${eventos.length} evento${eventos.length !== 1 ? 's' : ''} eliminado${eventos.length !== 1 ? 's' : ''}`
            }
          </span>
        </div>
      </div>

      {/* Barra de filtros */}
      {eventos.length > 0 && (
        <div className="eliminados-filtros">
          <div className="eliminados-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar cliente, telefono, motivo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button className="elim-clear-search" onClick={() => setBusqueda('')}>&times;</button>
            )}
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="elim-filtro-select"
          >
            <option value="">Estado previo</option>
            {estadosPrevios.map(est => (
              <option key={est} value={est}>{est}</option>
            ))}
          </select>
          <select
            value={filtroLocal}
            onChange={(e) => setFiltroLocal(e.target.value)}
            className="elim-filtro-select"
          >
            <option value="">Local</option>
            {LOCALES.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
          {isAdmin && (
            <select
              value={filtroComercial}
              onChange={(e) => setFiltroComercial(e.target.value)}
              className="elim-filtro-select"
            >
              <option value="">Comercial</option>
              {comerciales.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
          {hayFiltrosActivos && (
            <button className="elim-btn-limpiar" onClick={limpiarFiltros}>
              Limpiar
            </button>
          )}
        </div>
      )}

      {eventos.length === 0 ? (
        <div className="eliminados-vacio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <p>La papelera esta vacia</p>
        </div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="eliminados-vacio">
          <p>No hay resultados con los filtros aplicados</p>
        </div>
      ) : (
        <div className="eliminados-tabla-container">
          <table className="eliminados-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Local</th>
                <th>Fecha evento</th>
                <th>Estado previo</th>
                <th>Motivo de eliminacion</th>
                <th>Eliminado</th>
                <th>Comercial</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {eventosFiltrados.map((evento) => (
                <tr key={evento.id}>
                  <td className="col-cliente-elim">
                    <span className="cliente-nombre-elim">{evento.cliente?.nombre || '-'}</span>
                    <span className="cliente-titulo-elim">{evento.titulo_display || ''}</span>
                  </td>
                  <td>{evento.local?.nombre || <span className="sin-dato">-</span>}</td>
                  <td>{formatearFecha(evento.fecha_evento)}</td>
                  <td>
                    <span className={`badge-estado-prev estado-${evento.estado_pre_eliminacion?.toLowerCase()}`}>
                      {evento.estado_pre_eliminacion || '-'}
                    </span>
                  </td>
                  <td className="col-motivo-elim">
                    <span className="motivo-texto">{evento.motivo_eliminacion || '-'}</span>
                  </td>
                  <td className="col-fecha-elim">{formatearFecha(evento.updated_at)}</td>
                  <td>{evento.comercial?.nombre || <span className="sin-dato">-</span>}</td>
                  <td className="col-acciones-elim">
                    <button
                      className="btn-restaurar"
                      onClick={() => setShowConfirmar(evento)}
                      disabled={restaurando === evento.id}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                      </svg>
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de confirmación de restauración */}
      {showConfirmar && (
        <div className="modal-overlay" onClick={() => { if (!restaurando) setShowConfirmar(null); }}>
          <div className="modal-content modal-small modal-revertir" onClick={(e) => e.stopPropagation()}>
            <div className="revertir-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="44" height="44">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            </div>

            <h3>Restaurar evento</h3>

            <p className="revertir-message">
              ¿Seguro que quieres restaurar el evento de <strong>{showConfirmar.cliente?.nombre || 'cliente'}</strong>? Volvera al estado <strong>{showConfirmar.estado_pre_eliminacion || 'CONSULTA_ENTRANTE'}</strong>.
            </p>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirmar(null)}
                disabled={restaurando === showConfirmar.id}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-revertir-confirm"
                onClick={() => handleRestaurar(showConfirmar.id)}
                disabled={restaurando === showConfirmar.id}
              >
                {restaurando === showConfirmar.id ? 'Restaurando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
