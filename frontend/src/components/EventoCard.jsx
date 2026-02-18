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

export default function EventoCard({ evento, onClick, onPrecheckClick, onEtiquetaChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  // Color del avatar basado en el ID del comercial
  const avatarColor = evento.comercial
    ? AVATAR_COLORS[(evento.comercial.id - 1) % AVATAR_COLORS.length]
    : '#9ca3af';

  // Título: usa titulo_display del backend, o genera localmente como fallback
  const titulo = evento.titulo_display || evento.titulo || generarTituloAuto(evento);

  // Estados finales no muestran etiquetas
  const esEstadoFinal = evento.estado === 'APROBADO' || evento.estado === 'RECHAZADO';

  const handleEtiquetaClick = (e) => {
    e.stopPropagation();
    if (!esEstadoFinal) {
      setShowMenu(!showMenu);
    }
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
      className="evento-card"
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

          {/* Etiquetas - Solo mostrar si no es estado final */}
          {!esEstadoFinal && (
            <div className="etiquetas-container">
              <div className="etiquetas-dots" onClick={handleEtiquetaClick}>
                {/* Punto prioritario (rojo) - solo si está activo o ambos vacíos */}
                <span
                  className={`etiqueta-dot ${evento.es_prioritario ? 'prioritario' : 'empty'} ${!evento.es_prioritario && !evento.es_tentativo ? 'show-empty' : ''}`}
                  title={evento.es_prioritario ? 'Prioritario' : 'Marcar etiqueta'}
                />
                {/* Punto tentativo (verde) - solo si está activo */}
                {evento.es_tentativo && (
                  <span
                    className="etiqueta-dot tentativo"
                    title="Tentativo"
                  />
                )}
              </div>

              {/* Menú de etiquetas */}
              {showMenu && (
                <>
                  <div className="etiqueta-menu-overlay" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                  <div className="etiqueta-menu" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                </>
              )}
            </div>
          )}
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
