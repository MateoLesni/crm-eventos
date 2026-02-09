import { useState, useEffect } from 'react';
import { precheckApi } from '../services/api';
import './PreCheckTab.css';

const CATEGORIAS = ['Gastronomía', 'Venue', 'Técnica', 'Servicios', 'Otros'];
const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otros'];

export default function PreCheckTab({ eventoId, estado, onPrecheckChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [precheck, setPrecheck] = useState(null);

  // Estados para formularios
  const [showConceptoForm, setShowConceptoForm] = useState(false);
  const [showAdicionalForm, setShowAdicionalForm] = useState(false);
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Formulario concepto
  const [conceptoForm, setConceptoForm] = useState({
    categoria: 'Gastronomía',
    categoria_otro: '',
    descripcion: '',
    cantidad: 1,
    precio_unitario: 0
  });

  // Formulario adicional
  const [adicionalForm, setAdicionalForm] = useState({
    categoria: 'Gastronomía',
    categoria_otro: '',
    descripcion: '',
    monto: 0
  });

  // Formulario pago
  const [pagoForm, setPagoForm] = useState({
    metodo_pago: 'Transferencia',
    monto: 0,
    fecha_pago: new Date().toISOString().split('T')[0],
    notas: ''
  });

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarPrecheck();
  }, [eventoId]);

  const cargarPrecheck = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await precheckApi.obtener(eventoId);
      setPrecheck(response.data);
      if (onPrecheckChange) {
        onPrecheckChange(response.data.resumen.tiene_items);
      }
    } catch (err) {
      console.error('Error cargando pre-check:', err);
      if (err.response?.status === 403) {
        setError('El pre-check solo está disponible para eventos confirmados o concluidos');
      } else {
        setError('Error al cargar el pre-check');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatearMoneda = (valor) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(valor);
  };

  // Formatear número con separador de miles (para inputs)
  const formatearNumero = (valor) => {
    if (valor === '' || valor === null || valor === undefined) return '';
    const numero = parseInt(String(valor).replace(/\./g, ''), 10);
    if (isNaN(numero)) return '';
    return numero.toLocaleString('es-AR');
  };

  // Parsear número formateado a número real
  const parsearNumero = (valorFormateado) => {
    if (!valorFormateado) return 0;
    return parseInt(String(valorFormateado).replace(/\./g, ''), 10) || 0;
  };

  // Manejar cambio en input de monto (con formateo en tiempo real)
  const handleMontoChange = (valorFormateado, setter, campo) => {
    // Remover todo excepto números
    const soloNumeros = valorFormateado.replace(/[^\d]/g, '');
    const numero = parseInt(soloNumeros, 10) || 0;
    setter(prev => ({ ...prev, [campo]: numero }));
  };

  // Obtener valor formateado para mostrar en input
  const getMontoFormateado = (valor) => {
    if (valor === 0 || valor === '' || valor === null) return '';
    return formatearNumero(valor);
  };

  // ==================== CONCEPTOS ====================

  const handleGuardarConcepto = async () => {
    try {
      setGuardando(true);
      if (editingItem) {
        await precheckApi.actualizarConcepto(eventoId, editingItem.id, conceptoForm);
      } else {
        await precheckApi.agregarConcepto(eventoId, conceptoForm);
      }
      await cargarPrecheck();
      resetConceptoForm();
    } catch (err) {
      console.error('Error guardando concepto:', err);
      alert(err.response?.data?.error || 'Error al guardar concepto');
    } finally {
      setGuardando(false);
    }
  };

  const handleEditarConcepto = (concepto) => {
    setConceptoForm({
      categoria: concepto.categoria,
      categoria_otro: concepto.categoria_otro || '',
      descripcion: concepto.descripcion,
      cantidad: concepto.cantidad,
      precio_unitario: concepto.precio_unitario
    });
    setEditingItem(concepto);
    setShowConceptoForm(true);
  };

  const handleEliminarConcepto = async (conceptoId) => {
    if (!confirm('¿Eliminar este concepto?')) return;
    try {
      await precheckApi.eliminarConcepto(eventoId, conceptoId);
      await cargarPrecheck();
    } catch (err) {
      console.error('Error eliminando concepto:', err);
      alert(err.response?.data?.error || 'Error al eliminar concepto');
    }
  };

  const resetConceptoForm = () => {
    setConceptoForm({
      categoria: 'Gastronomía',
      categoria_otro: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0
    });
    setEditingItem(null);
    setShowConceptoForm(false);
  };

  // ==================== ADICIONALES ====================

  const handleGuardarAdicional = async () => {
    try {
      setGuardando(true);
      if (editingItem) {
        await precheckApi.actualizarAdicional(eventoId, editingItem.id, adicionalForm);
      } else {
        await precheckApi.agregarAdicional(eventoId, adicionalForm);
      }
      await cargarPrecheck();
      resetAdicionalForm();
    } catch (err) {
      console.error('Error guardando adicional:', err);
      alert(err.response?.data?.error || 'Error al guardar adicional');
    } finally {
      setGuardando(false);
    }
  };

  const handleEditarAdicional = (adicional) => {
    setAdicionalForm({
      categoria: adicional.categoria,
      categoria_otro: adicional.categoria_otro || '',
      descripcion: adicional.descripcion,
      monto: adicional.monto
    });
    setEditingItem(adicional);
    setShowAdicionalForm(true);
  };

  const handleEliminarAdicional = async (adicionalId) => {
    if (!confirm('¿Eliminar este adicional?')) return;
    try {
      await precheckApi.eliminarAdicional(eventoId, adicionalId);
      await cargarPrecheck();
    } catch (err) {
      console.error('Error eliminando adicional:', err);
      alert(err.response?.data?.error || 'Error al eliminar adicional');
    }
  };

  const resetAdicionalForm = () => {
    setAdicionalForm({
      categoria: 'Gastronomía',
      categoria_otro: '',
      descripcion: '',
      monto: 0
    });
    setEditingItem(null);
    setShowAdicionalForm(false);
  };

  // ==================== PAGOS ====================

  const handleGuardarPago = async () => {
    try {
      setGuardando(true);
      if (editingItem) {
        await precheckApi.actualizarPago(eventoId, editingItem.id, pagoForm);
      } else {
        await precheckApi.agregarPago(eventoId, pagoForm);
      }
      await cargarPrecheck();
      resetPagoForm();
    } catch (err) {
      console.error('Error guardando pago:', err);
      alert(err.response?.data?.error || 'Error al guardar pago');
    } finally {
      setGuardando(false);
    }
  };

  const handleEditarPago = (pago) => {
    setPagoForm({
      metodo_pago: pago.metodo_pago,
      monto: pago.monto,
      fecha_pago: pago.fecha_pago,
      notas: pago.notas || ''
    });
    setEditingItem(pago);
    setShowPagoForm(true);
  };

  const handleEliminarPago = async (pagoId) => {
    if (!confirm('¿Eliminar este pago?')) return;
    try {
      await precheckApi.eliminarPago(eventoId, pagoId);
      await cargarPrecheck();
    } catch (err) {
      console.error('Error eliminando pago:', err);
      alert(err.response?.data?.error || 'Error al eliminar pago');
    }
  };

  const handleSubirComprobante = async (pagoId, file) => {
    try {
      await precheckApi.subirComprobante(eventoId, pagoId, file);
      await cargarPrecheck();
    } catch (err) {
      console.error('Error subiendo comprobante:', err);
      alert(err.response?.data?.error || 'Error al subir comprobante');
    }
  };

  const resetPagoForm = () => {
    setPagoForm({
      metodo_pago: 'Transferencia',
      monto: 0,
      fecha_pago: new Date().toISOString().split('T')[0],
      notas: ''
    });
    setEditingItem(null);
    setShowPagoForm(false);
  };

  // ==================== FACTURADA ====================

  const handleToggleFacturada = async () => {
    try {
      await precheckApi.actualizarFacturada(eventoId, !precheck.facturada);
      await cargarPrecheck();
    } catch (err) {
      console.error('Error actualizando facturada:', err);
      alert(err.response?.data?.error || 'Error al actualizar estado de facturación');
    }
  };

  // ==================== EXPORTAR PDF ====================

  const handleExportarPdf = async () => {
    try {
      const response = await precheckApi.descargarPdf(eventoId);
      // Crear URL del blob y descargar
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `precheck_evento_${eventoId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exportando PDF:', err);
      alert('Error al exportar PDF');
    }
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div className="precheck-loading">
        <div className="spinner"></div>
        <p>Cargando pre-check...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="precheck-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!precheck) {
    return (
      <div className="precheck-no-disponible">
        <p>Pre-check no disponible</p>
      </div>
    );
  }

  const { conceptos, adicionales, pagos, resumen, puede_editar, puede_editar_pagos } = precheck;

  return (
    <div className="precheck-container">
      {/* Header con toggle de facturada y boton PDF */}
      <div className="precheck-header">
        <div className="facturada-toggle">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={precheck.facturada}
              onChange={handleToggleFacturada}
              disabled={!puede_editar}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="toggle-label">
            Facturada {precheck.facturada && '(+21% IVA)'}
          </span>
        </div>
        <div className="header-actions">
          {!puede_editar && (
            <span className="solo-lectura-badge">Solo lectura</span>
          )}
          <button className="btn-exportar-pdf" onClick={handleExportarPdf} title="Exportar PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <polyline points="9 15 12 18 15 15"/>
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Sección Conceptos */}
      <section className="precheck-section">
        <div className="section-header">
          <h4>Conceptos</h4>
          {puede_editar && (
            <button
              className="btn-agregar"
              onClick={() => {
                resetConceptoForm();
                setShowConceptoForm(true);
              }}
            >
              + Agregar
            </button>
          )}
        </div>

        {conceptos.length === 0 ? (
          <p className="empty-message">No hay conceptos agregados</p>
        ) : (
          <table className="precheck-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Descripción</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P. Unit.</th>
                <th className="text-right">Subtotal</th>
                {puede_editar && <th className="text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.id} className={c.precio_unitario < 0 ? 'row-negativo' : ''}>
                  <td>{c.categoria === 'Otros' ? c.categoria_otro || 'Otros' : c.categoria}</td>
                  <td>{c.descripcion}</td>
                  <td className="text-right">{c.cantidad}</td>
                  <td className="text-right">{formatearMoneda(c.precio_unitario)}</td>
                  <td className="text-right">{formatearMoneda(c.subtotal)}</td>
                  {puede_editar && (
                    <td className="text-center acciones-cell">
                      <button onClick={() => handleEditarConcepto(c)} title="Editar">✏️</button>
                      <button onClick={() => handleEliminarConcepto(c.id)} title="Eliminar">🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={puede_editar ? 4 : 4} className="text-right"><strong>Total Conceptos:</strong></td>
                <td className="text-right"><strong>{formatearMoneda(resumen.total_conceptos)}</strong></td>
                {puede_editar && <td></td>}
              </tr>
            </tfoot>
          </table>
        )}

        {/* Formulario Concepto */}
        {showConceptoForm && (
          <div className="form-inline">
            <div className="form-row form-row-labels">
              <div className="form-field">
                <label>Categoría</label>
                <select
                  value={conceptoForm.categoria}
                  onChange={(e) => setConceptoForm({ ...conceptoForm, categoria: e.target.value })}
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              {conceptoForm.categoria === 'Otros' && (
                <div className="form-field">
                  <label>Especificar</label>
                  <input
                    type="text"
                    placeholder="Categoría"
                    value={conceptoForm.categoria_otro}
                    onChange={(e) => setConceptoForm({ ...conceptoForm, categoria_otro: e.target.value })}
                  />
                </div>
              )}
              <div className="form-field" style={{ flex: 2 }}>
                <label>Descripción</label>
                <input
                  type="text"
                  placeholder="Ej: Menú principal"
                  value={conceptoForm.descripcion}
                  onChange={(e) => setConceptoForm({ ...conceptoForm, descripcion: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ width: '80px' }}>
                <label>Cantidad</label>
                <input
                  type="text"
                  placeholder="50"
                  value={conceptoForm.cantidad || ''}
                  onChange={(e) => {
                    const valor = e.target.value.replace(/[^\d]/g, '');
                    setConceptoForm({ ...conceptoForm, cantidad: parseInt(valor, 10) || 0 });
                  }}
                />
              </div>
              <div className="form-field" style={{ width: '120px' }}>
                <label>Precio Unit.</label>
                <input
                  type="text"
                  placeholder="10.000"
                  value={getMontoFormateado(conceptoForm.precio_unitario)}
                  onChange={(e) => handleMontoChange(e.target.value, setConceptoForm, 'precio_unitario')}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-guardar" onClick={handleGuardarConcepto} disabled={guardando}>
                {guardando ? 'Guardando...' : (editingItem ? 'Actualizar' : 'Agregar')}
              </button>
              <button className="btn-cancelar" onClick={resetConceptoForm}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Sección Adicionales */}
      <section className="precheck-section">
        <div className="section-header">
          <h4>Adicionales</h4>
          {puede_editar && (
            <button
              className="btn-agregar"
              onClick={() => {
                resetAdicionalForm();
                setShowAdicionalForm(true);
              }}
            >
              + Agregar
            </button>
          )}
        </div>

        {adicionales.length === 0 ? (
          <p className="empty-message">No hay adicionales agregados</p>
        ) : (
          <table className="precheck-table">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Descripción</th>
                <th className="text-right">Monto</th>
                {puede_editar && <th className="text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {adicionales.map((a) => (
                <tr key={a.id} className={a.monto < 0 ? 'row-negativo' : ''}>
                  <td>{a.categoria === 'Otros' ? a.categoria_otro || 'Otros' : a.categoria}</td>
                  <td>{a.descripcion}</td>
                  <td className="text-right">{formatearMoneda(a.monto)}</td>
                  {puede_editar && (
                    <td className="text-center acciones-cell">
                      <button onClick={() => handleEditarAdicional(a)} title="Editar">✏️</button>
                      <button onClick={() => handleEliminarAdicional(a.id)} title="Eliminar">🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={puede_editar ? 2 : 2} className="text-right"><strong>Total Adicionales:</strong></td>
                <td className="text-right"><strong>{formatearMoneda(resumen.total_adicionales)}</strong></td>
                {puede_editar && <td></td>}
              </tr>
            </tfoot>
          </table>
        )}

        {/* Formulario Adicional */}
        {showAdicionalForm && (
          <div className="form-inline">
            <div className="form-row form-row-labels">
              <div className="form-field">
                <label>Categoría</label>
                <select
                  value={adicionalForm.categoria}
                  onChange={(e) => setAdicionalForm({ ...adicionalForm, categoria: e.target.value })}
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              {adicionalForm.categoria === 'Otros' && (
                <div className="form-field">
                  <label>Especificar</label>
                  <input
                    type="text"
                    placeholder="Categoría"
                    value={adicionalForm.categoria_otro}
                    onChange={(e) => setAdicionalForm({ ...adicionalForm, categoria_otro: e.target.value })}
                  />
                </div>
              )}
              <div className="form-field" style={{ flex: 2 }}>
                <label>Descripción</label>
                <input
                  type="text"
                  placeholder="Ej: Decoración extra"
                  value={adicionalForm.descripcion}
                  onChange={(e) => setAdicionalForm({ ...adicionalForm, descripcion: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ width: '120px' }}>
                <label>Monto</label>
                <input
                  type="text"
                  placeholder="50.000"
                  value={getMontoFormateado(adicionalForm.monto)}
                  onChange={(e) => handleMontoChange(e.target.value, setAdicionalForm, 'monto')}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-guardar" onClick={handleGuardarAdicional} disabled={guardando}>
                {guardando ? 'Guardando...' : (editingItem ? 'Actualizar' : 'Agregar')}
              </button>
              <button className="btn-cancelar" onClick={resetAdicionalForm}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Resumen de Totales */}
      <section className="precheck-totales">
        <div className="totales-row">
          <span>Subtotal:</span>
          <span>{formatearMoneda(resumen.subtotal)}</span>
        </div>
        {precheck.facturada && (
          <div className="totales-row iva">
            <span>IVA (21%):</span>
            <span>{formatearMoneda(resumen.iva)}</span>
          </div>
        )}
        <div className="totales-row total">
          <span>TOTAL:</span>
          <span>{formatearMoneda(resumen.total)}</span>
        </div>
      </section>

      {/* Sección Pagos */}
      <section className="precheck-section pagos-section">
        <div className="section-header">
          <h4>Pagos Recibidos</h4>
          {puede_editar_pagos && (
            <button
              className="btn-agregar"
              onClick={() => {
                resetPagoForm();
                setShowPagoForm(true);
              }}
            >
              + Agregar Pago
            </button>
          )}
        </div>

        {pagos.length === 0 ? (
          <p className="empty-message">No hay pagos registrados</p>
        ) : (
          <table className="precheck-table pagos-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Método</th>
                <th className="text-right">Monto</th>
                <th>Comprobante</th>
                <th>Notas</th>
                {puede_editar_pagos && <th className="text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.fecha_pago).toLocaleDateString('es-AR')}</td>
                  <td>{p.metodo_pago}</td>
                  <td className="text-right">{formatearMoneda(p.monto)}</td>
                  <td>
                    {p.comprobante_url ? (
                      <a href={p.comprobante_url} target="_blank" rel="noopener noreferrer" className="comprobante-link">
                        📎 {p.comprobante_nombre || 'Ver'}
                      </a>
                    ) : puede_editar_pagos ? (
                      <label className="upload-label">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            if (e.target.files[0]) {
                              handleSubirComprobante(p.id, e.target.files[0]);
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        <span className="upload-btn">📤 Subir</span>
                      </label>
                    ) : (
                      <span className="sin-comprobante">-</span>
                    )}
                  </td>
                  <td className="notas-cell">{p.notas || '-'}</td>
                  {puede_editar_pagos && (
                    <td className="text-center acciones-cell">
                      <button onClick={() => handleEditarPago(p)} title="Editar">✏️</button>
                      <button onClick={() => handleEliminarPago(p.id)} title="Eliminar">🗑️</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="text-right"><strong>Total Pagado:</strong></td>
                <td className="text-right"><strong>{formatearMoneda(resumen.total_pagado)}</strong></td>
                <td colSpan={puede_editar_pagos ? 3 : 2}></td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Formulario Pago */}
        {showPagoForm && (
          <div className="form-inline">
            <div className="form-row form-row-labels">
              <div className="form-field">
                <label>Fecha</label>
                <input
                  type="date"
                  value={pagoForm.fecha_pago}
                  onChange={(e) => setPagoForm({ ...pagoForm, fecha_pago: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Método</label>
                <select
                  value={pagoForm.metodo_pago}
                  onChange={(e) => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })}
                >
                  {METODOS_PAGO.map((metodo) => (
                    <option key={metodo} value={metodo}>{metodo}</option>
                  ))}
                </select>
              </div>
              <div className="form-field" style={{ width: '120px' }}>
                <label>Monto</label>
                <input
                  type="text"
                  placeholder="100.000"
                  value={getMontoFormateado(pagoForm.monto)}
                  onChange={(e) => handleMontoChange(e.target.value, setPagoForm, 'monto')}
                />
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Notas</label>
                <input
                  type="text"
                  placeholder="Opcional"
                  value={pagoForm.notas}
                  onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-guardar" onClick={handleGuardarPago} disabled={guardando}>
                {guardando ? 'Guardando...' : (editingItem ? 'Actualizar' : 'Agregar')}
              </button>
              <button className="btn-cancelar" onClick={resetPagoForm}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* Saldo Pendiente */}
      <section className={`precheck-pendiente ${resumen.pendiente <= 0 ? 'saldado' : 'pendiente'}`}>
        <div className="pendiente-row">
          <span>{resumen.pendiente <= 0 ? 'SALDADO' : 'SALDO PENDIENTE:'}</span>
          <span>{formatearMoneda(Math.abs(resumen.pendiente))}</span>
        </div>
      </section>
    </div>
  );
}
