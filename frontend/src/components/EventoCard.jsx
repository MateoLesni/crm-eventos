import { useState } from 'react';
import { eventosApi } from '../services/api';
import './EventoCard.css';

// Avatares de colores para comerciales
const AVATAR_COLORS = [
  '#f59e0b', // Amarillo
  '#22c55e', // Verde
  '#3b82f6', // Azul
  '#8b5cf6', // Violeta
  '#ec4899', // Rosa
];

// Genera título automático: "PAX 20 — Costa 7070 — Social"
function generarTituloAuto(evento) {
  const partes = [];

  if (evento.cantidad_personas) {
    partes.push(`PAX ${evento.cantidad_personas}`);
  }

  if (evento.local?.nombre) {
    partes.push(evento.local.nombre);
  }

  if (evento.tipo) {
    partes.push(evento.tipo.charAt(0).toUpperCase() + evento.tipo.slice(1));
  }

  if (partes.length > 0) {
    return partes.join(' — ');
  }

  // Fallback si no hay datos
  return `Evento de ${evento.cliente?.nombre || 'cliente'}`;
}

export default function EventoCard({ evento, onClick, onPrecheckClick, onEtiquetaChange, onEliminar }) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  // Color del avatar basado en el ID del comercial
  const avatarColor = evento.comercial
    ? AVATAR_COLORS[(evento.comercial.id - 1) % AVATAR_COLORS.length]
    : '#9ca3af';

  // Título: usa titulo_display del backend, o genera localmente como fallback
  const titulo = evento.titulo_display || evento.titulo || generarTituloAuto(evento);

  // Estados finales no muestran etiquetas de prioritario/tentativo
  const esEstadoFinal = evento.estado === 'APROBADO' || evento.estado === 'RECHAZADO';

  const handleEtiquetaClick = (e) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleSetEtiqueta = async (tipo) => {
    setLoading(true);
    setShowMenu(false);

    try {
      let newValue;
      if (tipo === 'prioritario') {
        newValue = { es_prioritario: !evento.es_prioritario };
      } else if (tipo === 'tentativo') {
        newValue = { es_tentativo: !evento.es_tentativo };
      } else if (tipo === 'clear') {
        newValue = { es_prioritario: false, es_tentativo: false };
      }

      await eventosApi.toggleEtiquetas(evento.id, newValue);
      if (onEtiquetaChange) {
        onEtiquetaChange();
      }
    } catch (error) {
      console.error('Error al cambiar etiqueta:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`evento-card${evento.sla_info?.status === 'critico' ? ' sla-critico' : evento.sla_info?.status === 'alerta' ? ' sla-alerta' : ''}`}
      onClick={onClick}
    >
      <div className="card-content">
        <div className="card-main">
          <h4 className="card-titulo">
            {titulo}
          </h4>
          <p className="card-cliente">
            {evento.cliente?.nombre || 'Sin cliente'}
          </p>
        </div>

        <div className="card-right">
          {evento.tiene_precheck && (
            <span
              className="precheck-indicator"
              title="Tiene Pre-Check - Click para abrir"
              onClick={(e) => {
                e.stopPropagation();
                if (onPrecheckClick) onPrecheckClick();
              }}
              style={{ cursor: 'pointer' }}
            >
              P
            </span>
          )}

          {/* Etiquetas y menú de acciones */}
          <div className="etiquetas-container">
            <div className="etiquetas-dots" onClick={handleEtiquetaClick}>
              {/* Punto prioritario (rojo) - solo si está activo o ambos vacíos (no en estados finales) */}
              {!esEstadoFinal && (
                <span
                  className={`etiqueta-dot ${evento.es_prioritario ? 'prioritario' : 'empty'} ${!evento.es_prioritario && !evento.es_tentativo ? 'show-empty' : ''}`}
                  title={evento.es_prioritario ? 'Prioritario' : 'Marcar etiqueta'}
                />
              )}
              {/* Punto tentativo (verde) - solo si está activo */}
              {!esEstadoFinal && evento.es_tentativo && (
                <span
                  className="etiqueta-dot tentativo"
                  title="Tentativo"
                />
              )}
              {/* En estados finales, mostrar solo el dot vacío para acceder al menú */}
              {esEstadoFinal && (
                <span className="etiqueta-dot empty show-empty" title="Opciones" />
              )}
            </div>

            {/* Menú de etiquetas */}
            {showMenu && (
              <>
                <div className="etiqueta-menu-overlay" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                <div className="etiqueta-menu" onClick={(e) => e.stopPropagation()}>
                  {!esEstadoFinal && (
                    <>
                      <button
                        className={`etiqueta-option ${evento.es_prioritario ? 'active' : ''}`}
                        onClick={() => handleSetEtiqueta('prioritario')}
                        disabled={loading}
                      >
                        <span className="etiqueta-dot prioritario" />
                        Prioritario
                        {evento.es_prioritario && <span className="check-mark">✓</span>}
                      </button>
                      <button
                        className={`etiqueta-option ${evento.es_tentativo ? 'active' : ''}`}
                        onClick={() => handleSetEtiqueta('tentativo')}
                        disabled={loading}
                      >
                        <span className="etiqueta-dot tentativo" />
                        Tentativo
                        {evento.es_tentativo && <span className="check-mark">✓</span>}
                      </button>
                      {(evento.es_prioritario || evento.es_tentativo) && (
                        <button
                          className="etiqueta-option clear"
                          onClick={() => handleSetEtiqueta('clear')}
                          disabled={loading}
                        >
                          Quitar todas
                        </button>
                      )}
                    </>
                  )}
                  {!esEstadoFinal && <div className="etiqueta-menu-divider" />}
                  <button
                    className="etiqueta-option eliminar"
                    onClick={() => { setShowMenu(false); if (onEliminar) onEliminar(); }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card-footer">
        <div className="card-avatar" style={{ backgroundColor: avatarColor }}>
          {evento.comercial?.nombre?.charAt(0) || '?'}
        </div>
        <span className="card-monto">
          ${evento.presupuesto ? evento.presupuesto.toLocaleString() : '0'}
        </span>
        <button className="card-arrow" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
