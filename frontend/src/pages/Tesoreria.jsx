import { useState, useEffect, useCallback } from 'react';
import { tesoreriaApi } from '../services/api';
import './Tesoreria.css';

const FILTROS_INICIALES = {
  fechaDepositoDesde: '',
  fechaDepositoHasta: '',
  fechaAcreditacionDesde: '',
  fechaAcreditacionHasta: '',
  fechaCargaDesde: '',
  fechaCargaHasta: '',
  local: '',
  metodo: '',
  numeroOppen: '',
};

export default function Tesoreria() {
  const [tab, setTab] = useState('pendientes');
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formPago, setFormPago] = useState(null); // { tipo: 'validar'|'rechazar', pago }
  const [formData, setFormData] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState({ pendientes: 0, validados: 0, rechazados: 0 });
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const cargarPagos = useCallback(async () => {
    setLoading(true);
    try {
      let response;
      if (tab === 'pendientes') {
        response = await tesoreriaApi.obtenerPagosPendientes();
      } else if (tab === 'validados') {
        response = await tesoreriaApi.obtenerPagosValidados();
      } else {
        response = await tesoreriaApi.obtenerPagosRechazados();
      }
      setPagos(response.data.pagos || []);

      // Cargar conteos en paralelo
      const [pend, val, rech] = await Promise.all([
        tesoreriaApi.obtenerPagosPendientes(),
        tesoreriaApi.obtenerPagosValidados(),
        tesoreriaApi.obtenerPagosRechazados(),
      ]);
      setCounts({
        pendientes: pend.data.total_pendientes || pend.data.pagos?.length || 0,
        validados: val.data.pagos?.length || 0,
        rechazados: rech.data.pagos?.length || 0,
      });
    } catch (error) {
      console.error('Error cargando pagos:', error);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    cargarPagos();
  }, [cargarPagos]);

  const abrirFormValidar = (pago) => {
    setFormPago({ tipo: 'validar', pago });
    setFormData({
      numero_oppen: '',
      monto: pago.monto,
      observacion_monto: '',
    });
    setFormError('');
  };

  const abrirFormRechazar = (pago) => {
    setFormPago({ tipo: 'rechazar', pago });
    setFormData({ motivo_rechazo: '' });
    setFormError('');
  };

  const cerrarForm = () => {
    setFormPago(null);
    setFormData({});
    setFormError('');
  };

  const handleValidar = async () => {
    if (!formData.numero_oppen?.trim()) {
      setFormError('El N° Oppen es obligatorio');
      return;
    }

    const montoOriginal = formPago.pago.monto;
    const montoNuevo = parsearNumero(formData.monto);
    if (montoNuevo !== montoOriginal && !formData.observacion_monto?.trim()) {
      setFormError('La observación es obligatoria al modificar el monto');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const payload = { numero_oppen: formData.numero_oppen.trim() };
      if (montoNuevo !== Math.round(montoOriginal)) {
        payload.monto = montoNuevo;
        payload.observacion_monto = formData.observacion_monto.trim();
      }
      await tesoreriaApi.validarPago(formPago.pago.id, payload);
      cerrarForm();
      cargarPagos();
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error al validar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    if (!formData.motivo_rechazo?.trim()) {
      setFormError('El motivo es obligatorio');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      await tesoreriaApi.rechazarPago(formPago.pago.id, {
        motivo_rechazo: formData.motivo_rechazo.trim(),
      });
      cerrarForm();
      cargarPagos();
    } catch (error) {
      setFormError(error.response?.data?.error || 'Error al rechazar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const formatMonto = (monto) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(monto);
  };

  const formatearNumero = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return '';
    const numero = parseInt(String(valor).replace(/\./g, ''), 10);
    if (isNaN(numero)) return '';
    return numero.toLocaleString('es-AR');
  };

  const parsearNumero = (valorFormateado) => {
    if (!valorFormateado) return 0;
    return parseInt(String(valorFormateado).replace(/\./g, ''), 10) || 0;
  };

  const formatFecha = (fecha) => {
    if (!fecha) return '-';
    const d = new Date(fecha + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // Extraer opciones únicas para los selects de filtro
  const localesUnicos = [...new Set(pagos.map(p => p.local_nombre).filter(Boolean))].sort();
  const metodosUnicos = [...new Set(pagos.map(p => p.metodo_pago).filter(Boolean))].sort();

  const filtrosActivos = Object.values(filtros).some(v => v !== '');

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  // Filtrar pagos en memoria
  const pagosFiltrados = pagos.filter(p => {
    if (filtros.fechaDepositoDesde && (!p.fecha_deposito || p.fecha_deposito < filtros.fechaDepositoDesde)) return false;
    if (filtros.fechaDepositoHasta && (!p.fecha_deposito || p.fecha_deposito > filtros.fechaDepositoHasta)) return false;
    if (filtros.fechaAcreditacionDesde && (!p.fecha_acreditacion || p.fecha_acreditacion < filtros.fechaAcreditacionDesde)) return false;
    if (filtros.fechaAcreditacionHasta && (!p.fecha_acreditacion || p.fecha_acreditacion > filtros.fechaAcreditacionHasta)) return false;
    if (filtros.fechaCargaDesde && p.created_at) {
      const carga = p.created_at.split('T')[0];
      if (carga < filtros.fechaCargaDesde) return false;
    }
    if (filtros.fechaCargaHasta && p.created_at) {
      const carga = p.created_at.split('T')[0];
      if (carga > filtros.fechaCargaHasta) return false;
    }
    if (filtros.local && p.local_nombre !== filtros.local) return false;
    if (filtros.metodo && p.metodo_pago !== filtros.metodo) return false;
    if (filtros.numeroOppen && p.numero_oppen) {
      if (!p.numero_oppen.toLowerCase().includes(filtros.numeroOppen.toLowerCase())) return false;
    } else if (filtros.numeroOppen && !p.numero_oppen) {
      return false;
    }
    return true;
  });

  const totalMontoPendientes = pagosFiltrados
    .filter(() => tab === 'pendientes')
    .reduce((sum, p) => sum + (p.monto || 0), 0);

  return (
    <div className="tesoreria-container">
      {/* Tabs */}
      <div className="tesoreria-header">
        <div className="tesoreria-tabs">
          <button
            className={`tesoreria-tab ${tab === 'pendientes' ? 'active' : ''}`}
            onClick={() => setTab('pendientes')}
          >
            Pendientes
            {counts.pendientes > 0 && (
              <span className="tab-count pendiente">{counts.pendientes}</span>
            )}
          </button>
          <button
            className={`tesoreria-tab ${tab === 'validados' ? 'active' : ''}`}
            onClick={() => setTab('validados')}
          >
            Validados
            {counts.validados > 0 && (
              <span className="tab-count validado">{counts.validados}</span>
            )}
          </button>
          <button
            className={`tesoreria-tab ${tab === 'rechazados' ? 'active' : ''}`}
            onClick={() => setTab('rechazados')}
          >
            Rechazados
            {counts.rechazados > 0 && (
              <span className="tab-count rechazado">{counts.rechazados}</span>
            )}
          </button>
        </div>

        {tab === 'pendientes' && pagosFiltrados.length > 0 && (
          <div className="tesoreria-summary">
            <div className="summary-card pendiente">
              <span className="summary-valor">{pagosFiltrados.length}</span>
              <span className="summary-label">Pagos por revisar</span>
            </div>
            <div className="summary-card pendiente">
              <span className="summary-valor">{formatMonto(totalMontoPendientes)}</span>
              <span className="summary-label">Monto total pendiente</span>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      {pagos.length > 0 && (
        <div className="tesoreria-filtros-wrapper">
          <button
            className={`btn-toggle-filtros ${filtrosActivos ? 'activos' : ''}`}
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filtros
            {filtrosActivos && <span className="filtros-activos-dot" />}
          </button>
          {filtrosActivos && (
            <button className="btn-limpiar-filtros" onClick={limpiarFiltros}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {mostrarFiltros && (
        <div className="tesoreria-filtros">
          <div className="filtros-grid">
            <div className="filtro-group">
              <label>F. depósito desde</label>
              <input
                type="date"
                value={filtros.fechaDepositoDesde}
                onChange={(e) => setFiltros({ ...filtros, fechaDepositoDesde: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>F. depósito hasta</label>
              <input
                type="date"
                value={filtros.fechaDepositoHasta}
                onChange={(e) => setFiltros({ ...filtros, fechaDepositoHasta: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>F. acreditación desde</label>
              <input
                type="date"
                value={filtros.fechaAcreditacionDesde}
                onChange={(e) => setFiltros({ ...filtros, fechaAcreditacionDesde: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>F. acreditación hasta</label>
              <input
                type="date"
                value={filtros.fechaAcreditacionHasta}
                onChange={(e) => setFiltros({ ...filtros, fechaAcreditacionHasta: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>Fecha carga desde</label>
              <input
                type="date"
                value={filtros.fechaCargaDesde}
                onChange={(e) => setFiltros({ ...filtros, fechaCargaDesde: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>Fecha carga hasta</label>
              <input
                type="date"
                value={filtros.fechaCargaHasta}
                onChange={(e) => setFiltros({ ...filtros, fechaCargaHasta: e.target.value })}
              />
            </div>
            <div className="filtro-group">
              <label>Local</label>
              <select
                value={filtros.local}
                onChange={(e) => setFiltros({ ...filtros, local: e.target.value })}
              >
                <option value="">Todos</option>
                {localesUnicos.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="filtro-group">
              <label>Método</label>
              <select
                value={filtros.metodo}
                onChange={(e) => setFiltros({ ...filtros, metodo: e.target.value })}
              >
                <option value="">Todos</option>
                {metodosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {tab === 'validados' && (
              <div className="filtro-group">
                <label>N° Oppen</label>
                <input
                  type="text"
                  value={filtros.numeroOppen}
                  onChange={(e) => setFiltros({ ...filtros, numeroOppen: e.target.value })}
                  placeholder="Buscar..."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="tesoreria-loading">Cargando pagos...</div>
      ) : pagosFiltrados.length === 0 ? (
        <div className="tesoreria-table-container">
          <div className="tesoreria-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>
              {filtrosActivos
                ? 'No hay pagos que coincidan con los filtros'
                : tab === 'pendientes'
                ? 'No hay pagos pendientes de validación'
                : tab === 'validados'
                ? 'No hay pagos validados en los últimos 30 días'
                : 'No hay pagos rechazados en los últimos 30 días'}
            </p>
          </div>
        </div>
      ) : (
        <div className="tesoreria-table-container">
          <table className="tesoreria-table">
            <thead>
              <tr>
                <th>F. Depósito</th>
                <th>F. Acreditación</th>
                <th>Evento</th>
                <th>Cliente</th>
                <th>Local</th>
                <th>Comercial</th>
                <th>Método</th>
                <th>Monto</th>
                <th>Comprobante</th>
                {tab === 'pendientes' && <th>Acciones</th>}
                {tab === 'validados' && <th>Validación</th>}
                {tab === 'rechazados' && <th>Motivo</th>}
              </tr>
            </thead>
            <tbody>
              {pagosFiltrados.map((pago) => (
                <tr key={pago.id}>
                  <td>{formatFecha(pago.fecha_deposito)}</td>
                  <td>{formatFecha(pago.fecha_acreditacion)}</td>
                  <td className="evento-info">
                    <span className="evento-titulo-cell">{pago.evento_titulo}</span>
                  </td>
                  <td>{pago.cliente_nombre || '-'}</td>
                  <td>{pago.local_nombre || '-'}</td>
                  <td>{pago.comercial_nombre || '-'}</td>
                  <td>{pago.metodo_pago}</td>
                  <td className="monto">
                    {pago.monto_original ? (
                      <div className="monto-modificado">
                        <span>{formatMonto(pago.monto)}</span>
                        <span className="monto-original-tachado">{formatMonto(pago.monto_original)}</span>
                        {pago.observacion_monto && (
                          <span className="monto-observacion">{pago.observacion_monto}</span>
                        )}
                      </div>
                    ) : (
                      formatMonto(pago.monto)
                    )}
                  </td>
                  <td>
                    {pago.comprobante_url ? (
                      /\.(jpg|jpeg|png|gif|webp)/i.test(pago.comprobante_nombre || pago.comprobante_url.split('?')[0]) ? (
                        <img
                          src={pago.comprobante_url}
                          alt="Comprobante"
                          className="comprobante-thumb-tes"
                          onClick={() => setLightboxUrl(pago.comprobante_url)}
                        />
                      ) : (
                        <a
                          href={pago.comprobante_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="comprobante-link"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          {pago.comprobante_nombre || 'Ver PDF'}
                        </a>
                      )
                    ) : (
                      <span className="sin-comprobante">Sin comprobante</span>
                    )}
                  </td>
                  {tab === 'pendientes' && (
                    <td>
                      <div className="acciones-cell">
                        <button className="btn-validar" onClick={() => abrirFormValidar(pago)}>
                          Validar
                        </button>
                        <button className="btn-rechazar" onClick={() => abrirFormRechazar(pago)}>
                          Rechazar
                        </button>
                      </div>
                    </td>
                  )}
                  {tab === 'validados' && (
                    <td>
                      <span className="estado-badge validado">Validado</span>
                      <div className="validacion-info">
                        <span className="oppen">Oppen: {pago.numero_oppen}</span>
                        {pago.validado_por_nombre && (
                          <> - {pago.validado_por_nombre}</>
                        )}
                      </div>
                    </td>
                  )}
                  {tab === 'rechazados' && (
                    <td>
                      <span className="estado-badge rechazado">Rechazado</span>
                      {pago.motivo_rechazo && (
                        <div className="rechazo-motivo">{pago.motivo_rechazo}</div>
                      )}
                      {pago.validado_por_nombre && (
                        <div className="validacion-info">Por: {pago.validado_por_nombre}</div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de validación */}
      {formPago?.tipo === 'validar' && (
        <div className="inline-form-overlay" onClick={cerrarForm}>
          <div className="inline-form" onClick={(e) => e.stopPropagation()}>
            <h3>Validar pago</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280' }}>
              {formPago.pago.evento_titulo} - {formPago.pago.cliente_nombre}
            </p>

            {formError && <div className="form-error">{formError}</div>}

            <div className="form-group">
              <label>N° Oppen *</label>
              <input
                type="text"
                value={formData.numero_oppen}
                onChange={(e) => setFormData({ ...formData, numero_oppen: e.target.value })}
                placeholder="Ingresá el número de operación"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Monto</label>
              <input
                type="text"
                value={formatearNumero(formData.monto)}
                onChange={(e) => {
                  const soloNumeros = e.target.value.replace(/[^\d]/g, '');
                  const numero = parseInt(soloNumeros, 10) || 0;
                  setFormData({ ...formData, monto: numero });
                }}
              />
              {parsearNumero(formData.monto) !== formPago.pago.monto && (
                <div className="form-hint">
                  Monto original: {formatMonto(formPago.pago.monto)}. Si modificás el monto, la observación es obligatoria.
                </div>
              )}
            </div>

            {parsearNumero(formData.monto) !== formPago.pago.monto && (
              <div className="form-group">
                <label>Observación del monto *</label>
                <textarea
                  value={formData.observacion_monto}
                  onChange={(e) => setFormData({ ...formData, observacion_monto: e.target.value })}
                  placeholder="Explicá por qué se modifica el monto..."
                />
              </div>
            )}

            <div className="form-actions">
              <button className="btn-cancelar" onClick={cerrarForm}>Cancelar</button>
              <button
                className="btn-confirmar-validar"
                onClick={handleValidar}
                disabled={submitting}
              >
                {submitting ? 'Validando...' : 'Confirmar validación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de rechazo */}
      {formPago?.tipo === 'rechazar' && (
        <div className="inline-form-overlay" onClick={cerrarForm}>
          <div className="inline-form" onClick={(e) => e.stopPropagation()}>
            <h3>Rechazar pago</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280' }}>
              {formPago.pago.evento_titulo} - {formPago.pago.cliente_nombre} - {formatMonto(formPago.pago.monto)}
            </p>

            {formError && <div className="form-error">{formError}</div>}

            <div className="form-group">
              <label>Motivo del rechazo *</label>
              <textarea
                value={formData.motivo_rechazo}
                onChange={(e) => setFormData({ ...formData, motivo_rechazo: e.target.value })}
                placeholder="Explicá por qué se rechaza este pago..."
                autoFocus
              />
            </div>

            <div className="form-actions">
              <button className="btn-cancelar" onClick={cerrarForm}>Cancelar</button>
              <button
                className="btn-confirmar-rechazar"
                onClick={handleRechazar}
                disabled={submitting}
              >
                {submitting ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox para ver comprobantes */}
      {lightboxUrl && (
        <div className="comprobante-lightbox-tes" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox-content-tes" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close-tes" onClick={() => setLightboxUrl(null)}>&times;</button>
            <img src={lightboxUrl} alt="Comprobante" className="lightbox-img-tes" />
            <a
              href={lightboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lightbox-link-tes"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir en nueva pestaña
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
