import { useEffect, useState } from 'react';
import { hojaRutaApi } from '../services/api';
import './HojaRutaTab.css';

const errorDe = (err, porDefecto) => err?.response?.data?.error || porDefecto;

const fechaHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// Igual que en el backend: "1" -> pax, "1 cada 2" -> pax/2, "0,5" -> pax/2, "1/3" -> pax/3
function cantidadPorPax(porPax, pax) {
  if (!porPax || !pax) return null;
  const t = String(porPax).trim().toLowerCase().replace(',', '.');
  let factor = null;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(?:cada|c\/)\s*(\d+)$/);
  if (m) factor = Number(m[1]) / Number(m[2]);
  else if ((m = t.match(/^(\d+)\s*\/\s*(\d+)$/))) factor = Number(m[1]) / Number(m[2]);
  else if (/^\d+(\.\d+)?$/.test(t)) factor = Number(t);
  if (factor === null || !Number.isFinite(factor)) return null;
  return Math.ceil(factor * pax - 1e-9);
}

const SI_NO = [
  { v: '', l: '—' },
  { v: 'si', l: 'Sí' },
  { v: 'no', l: 'No' },
];
const aSelect = (v) => (v === true ? 'si' : v === false ? 'no' : '');
const deSelect = (v) => (v === 'si' ? true : v === 'no' ? false : null);

function Seccion({ titulo, ayuda, children, acciones }) {
  return (
    <section className="hr-seccion">
      <div className="hr-seccion-cab">
        <h4>{titulo}</h4>
        {acciones}
      </div>
      {ayuda && <p className="hr-ayuda">{ayuda}</p>}
      {children}
    </section>
  );
}

function Lista({ items, onCambiar, render, nuevo, textoAgregar, editable }) {
  return (
    <>
      {items.map((it, i) => (
        <div key={i} className="hr-fila">
          {render(it, (cambios) => onCambiar(items.map((x, j) => (j === i ? { ...x, ...cambios } : x))))}
          {editable && (
            <button className="hr-quitar" aria-label="Quitar" onClick={() => onCambiar(items.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
      ))}
      {editable && <button className="hr-agregar" onClick={() => onCambiar([...items, nuevo()])}>{textoAgregar}</button>}
    </>
  );
}

export default function HojaRutaTab({ eventoId }) {
  const [datos, setDatos] = useState(null);
  const [hdr, setHdr] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    try {
      const r = await hojaRutaApi.obtener(eventoId);
      setDatos(r.data);
      setHdr(r.data.contenido);
      setSucio(!r.data.existe);
      setError(null);
    } catch (err) {
      setError(errorDe(err, 'No se pudo cargar la hoja de ruta'));
    }
  };

  useEffect(() => {
    let vivo = true;
    hojaRutaApi.obtener(eventoId)
      .then((r) => {
        if (!vivo) return;
        setDatos(r.data);
        setHdr(r.data.contenido);
        setSucio(!r.data.existe);
      })
      .catch((err) => vivo && setError(errorDe(err, 'No se pudo cargar la hoja de ruta')));
    return () => { vivo = false; };
  }, [eventoId]);

  if (error) return <div className="precheck-error"><p>{error}</p></div>;
  if (!datos || !hdr) return <div className="precheck-loading"><div className="spinner"></div><p>Cargando hoja de ruta…</p></div>;

  const editable = datos.puede_editar;
  const pax = datos.cabecera.pax;
  const set = (cambios) => { setHdr({ ...hdr, ...cambios }); setSucio(true); };
  const setBeb = (cambios) => set({ bebidas: { ...hdr.bebidas, ...cambios } });

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await hojaRutaApi.guardar(eventoId, hdr);
      setHdr(r.data.contenido);
      setSucio(false);
      await cargar();
      return true;
    } catch (err) {
      alert(errorDe(err, 'No se pudo guardar'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const enviar = async () => {
    if (sucio && !(await guardar())) return;
    const nota = window.prompt(
      `Se congela la versión ${datos.version + 1} para mandar al local y a cocina.\nNota opcional (ej.: "enviada al grupo de WhatsApp de Costa"):`, '');
    if (nota === null) return;
    try {
      const r = await hojaRutaApi.enviar(eventoId, nota);
      await cargar();
      alert(`Versión ${r.data.version.version} lista. ${r.data.version.cambios}`);
    } catch (err) {
      alert(errorDe(err, 'No se pudo enviar'));
    }
  };

  const traerDelPrecheck = () => {
    if (!window.confirm('Se reemplazan menú, bebidas, servicios y técnica con lo que hay en el pre-check. ¿Seguir?')) return;
    const s = datos.sugerido;
    set({ menu: s.menu, bebidas: { ...hdr.bebidas, ...s.bebidas, tragos: s.bebidas.tragos.length ? s.bebidas.tragos : hdr.bebidas.tragos },
      servicios: s.servicios, tecnica: s.tecnica || hdr.tecnica });
  };

  const descargarPdf = async () => {
    try {
      if (sucio && !(await guardar())) return;
      const r = await hojaRutaApi.descargarPdf(eventoId);
      const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoja_ruta_${(datos.cabecera.cliente || 'evento').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('No se pudo generar el PDF');
    }
  };

  const subirPlano = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      await hojaRutaApi.subirPlano(eventoId, file);
      const r = await hojaRutaApi.obtener(eventoId);
      setDatos(r.data);
    } catch (err) {
      alert(errorDe(err, 'No se pudo subir el plano'));
    } finally {
      setSubiendo(false);
    }
  };

  const quitarPlano = async (p) => {
    if (!window.confirm(`¿Quitar el plano "${p.nombre}"?`)) return;
    try {
      await hojaRutaApi.eliminarPlano(eventoId, p.id);
      const r = await hojaRutaApi.obtener(eventoId);
      setDatos(r.data);
    } catch (err) {
      alert(errorDe(err, 'No se pudo quitar'));
    }
  };

  const ultima = datos.versiones[0];
  const cab = datos.cabecera;

  return (
    <div className="hr-container">
      <div className="hr-barra">
        <div className="hr-estado">
          {ultima ? (
            <span className="pc-estado pc-estado-aprobado">v{ultima.version} enviada {fechaHora(ultima.created_at)}</span>
          ) : <span className="pc-estado pc-estado-borrador">Sin enviar</span>}
          {(sucio || datos.cambios_sin_enviar) && ultima && <span className="pc-estado pc-estado-cambio">Cambios sin enviar</span>}
          {sucio && <span className="hr-sin-guardar">Sin guardar</span>}
        </div>
        <div className="hr-acciones">
          {editable && <button className="pc-btn" onClick={traerDelPrecheck}>Traer del pre-check</button>}
          {editable && <button className="pc-btn" onClick={guardar} disabled={!sucio || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>}
          {editable && <button className="pc-btn primario" onClick={enviar} disabled={guardando}>Enviar al local</button>}
          <button className="btn-exportar-pdf" onClick={descargarPdf}>PDF</button>
        </div>
      </div>
      {!editable && datos.motivo_no_editable && <div className="pc-solo-lectura">{datos.motivo_no_editable}</div>}

      <div className="pc-datos hr-cabecera">
        <div className="pc-dato"><span>Cliente</span><strong>{cab.cliente}</strong></div>
        <div className="pc-dato"><span>Fecha</span><strong>{cab.fecha_evento ? cab.fecha_evento.split('-').reverse().join('/') : '—'}</strong></div>
        <div className="pc-dato"><span>Horario</span><strong>{cab.horario || '—'}</strong></div>
        <div className="pc-dato"><span>Personas</span><strong>{cab.pax || '—'}</strong></div>
        <div className="pc-dato pc-dato-ancho"><span>Espacio</span><strong>{cab.espacio || '—'}</strong></div>
        <div className="pc-dato pc-dato-ancho"><span>Motivo</span><strong>{cab.motivo || '—'}</strong></div>
      </div>
      <p className="hr-ayuda">Estos datos salen del evento y del pre-check: se cambian ahí.</p>

      <fieldset disabled={!editable} className="hr-campos">
        <Seccion titulo="Menú" ayuda='"Por pax": 1, 2, 0,5 o "1 cada 2". La cantidad se calcula con las personas; si escribís una cantidad, manda esa.'>
          <label className="hr-restricciones">
            Restricciones alimentarias
            <input value={hdr.restricciones} placeholder="Ej.: 10 celíacos, 1 celíaco + veggie, 4 veggie"
              onChange={(e) => set({ restricciones: e.target.value })} />
          </label>
          {hdr.menu.map((b, bi) => {
            const cambiarBloque = (cambios) => set({ menu: hdr.menu.map((x, i) => (i === bi ? { ...x, ...cambios } : x)) });
            return (
              <div key={bi} className="hr-bloque">
                <div className="hr-bloque-cab">
                  <input className="hr-bloque-titulo" value={b.titulo} placeholder="Bloque (Bocados, Fríos, Estación 1, Postre…)"
                    onChange={(e) => cambiarBloque({ titulo: e.target.value })} />
                  {editable && <button className="hr-quitar" aria-label="Quitar bloque" onClick={() => set({ menu: hdr.menu.filter((_, i) => i !== bi) })}>×</button>}
                </div>
                <div className="hr-menu-cab"><span>Plato</span><span>Por pax</span><span>Cantidad</span></div>
                <Lista items={b.items} editable={editable} textoAgregar="+ Plato" nuevo={() => ({ nombre: '', por_pax: '1', cantidad: '' })}
                  onCambiar={(items) => cambiarBloque({ items })}
                  render={(it, cambiar) => (
                    <div className="hr-menu-item">
                      <input value={it.nombre} placeholder="Plato" onChange={(e) => cambiar({ nombre: e.target.value })} />
                      <input value={it.por_pax} placeholder="1" onChange={(e) => cambiar({ por_pax: e.target.value })} />
                      <input value={it.cantidad} placeholder={String(cantidadPorPax(it.por_pax, pax) ?? '')}
                        onChange={(e) => cambiar({ cantidad: e.target.value })} />
                    </div>
                  )} />
              </div>
            );
          })}
          {editable && <button className="hr-agregar" onClick={() => set({ menu: [...hdr.menu, { titulo: '', items: [] }] })}>+ Bloque de menú</button>}
        </Seccion>

        <Seccion titulo="Bebidas">
          <div className="hr-grilla">
            <label>Sin alcohol<input value={hdr.bebidas.sin_alcohol} onChange={(e) => setBeb({ sin_alcohol: e.target.value })} /></label>
            <label>Barra (modalidad)<input value={hdr.bebidas.barra_modalidad} placeholder="Libre, 2 tragos por persona…"
              onChange={(e) => setBeb({ barra_modalidad: e.target.value })} /></label>
            {['vinos', 'espumante'].map((k) => (
              <label key={k}>{k === 'vinos' ? 'Vinos' : 'Espumante'}
                <span className="hr-si-no">
                  <select value={aSelect(hdr.bebidas[k].incluye)} onChange={(e) => setBeb({ [k]: { ...hdr.bebidas[k], incluye: deSelect(e.target.value) } })}>
                    {SI_NO.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <input value={hdr.bebidas[k].detalle} placeholder="Cuál" onChange={(e) => setBeb({ [k]: { ...hdr.bebidas[k], detalle: e.target.value } })} />
                </span>
              </label>
            ))}
          </div>
          <h5 className="hr-sub">Tragos</h5>
          <Lista items={hdr.bebidas.tragos} editable={editable} textoAgregar="+ Trago" nuevo={() => ({ nombre: '', detalle: '' })}
            onCambiar={(tragos) => setBeb({ tragos })}
            render={(t, cambiar) => (
              <div className="hr-dos">
                <input value={t.nombre} placeholder="Trago" onChange={(e) => cambiar({ nombre: e.target.value })} />
                <input value={t.detalle} placeholder="Receta / aclaración (opcional)" onChange={(e) => cambiar({ detalle: e.target.value })} />
              </div>
            )} />
          <label className="hr-bloque-texto">Importante para la barra
            <textarea rows={2} value={hdr.bebidas.nota_barra} placeholder="Ej.: imprimir carta para los bartenders; los vinos salen de la octogonal"
              onChange={(e) => setBeb({ nota_barra: e.target.value })} />
          </label>
        </Seccion>

        <Seccion titulo="Servicios">
          <Lista items={hdr.servicios} editable={editable} textoAgregar="+ Servicio" nuevo={() => ({ nombre: '', incluye: null, detalle: '' })}
            onCambiar={(servicios) => set({ servicios })}
            render={(sv, cambiar) => (
              <div className="hr-servicio">
                <input value={sv.nombre} placeholder="Servicio" onChange={(e) => cambiar({ nombre: e.target.value })} />
                <select value={aSelect(sv.incluye)} onChange={(e) => cambiar({ incluye: deSelect(e.target.value) })}>
                  {SI_NO.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <input value={sv.detalle} placeholder="Detalle (quién, cuántos, horario…)" onChange={(e) => cambiar({ detalle: e.target.value })} />
              </div>
            )} />
        </Seccion>

        <Seccion titulo="Técnica">
          <textarea rows={3} value={hdr.tecnica} placeholder="Qué se suma, proveedor y horario de armado"
            onChange={(e) => set({ tecnica: e.target.value })} />
        </Seccion>

        <Seccion titulo="Armado / desarme y planos">
          <textarea rows={4} value={hdr.armado} placeholder="Cómo se arma cada espacio, qué se saca, qué traen ellos…"
            onChange={(e) => set({ armado: e.target.value })} />
          <div className="hr-planos">
            {datos.planos.map((p) => (
              <figure key={p.id} className="hr-plano">
                {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.nombre} /></a> : <div className="hr-plano-sin">Sin vista</div>}
                <figcaption>
                  {p.nombre}
                  {editable && <button className="hr-quitar" onClick={() => quitarPlano(p)} aria-label="Quitar plano">×</button>}
                </figcaption>
              </figure>
            ))}
            {editable && (
              <label className="hr-plano hr-plano-subir">
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={(e) => { subirPlano(e.target.files[0]); e.target.value = ''; }} />
                {subiendo ? 'Subiendo…' : '+ Subir plano (imagen)'}
              </label>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Timing" ayuda="Se ordena solo por día y hora.">
          <Lista items={hdr.timing} editable={editable} textoAgregar="+ Momento" nuevo={() => ({ dia: 'evento', hora: '', titulo: '', detalle: '' })}
            onCambiar={(timing) => set({ timing })}
            render={(t, cambiar) => (
              <div className="hr-timing">
                <select value={t.dia} onChange={(e) => cambiar({ dia: e.target.value })}>
                  {Object.entries(datos.dias_timing).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input value={t.hora} placeholder="19:00" onChange={(e) => cambiar({ hora: e.target.value })} />
                <input value={t.titulo} placeholder="Qué pasa (llegada de invitados, postre…)" onChange={(e) => cambiar({ titulo: e.target.value })} />
                <textarea rows={1} value={t.detalle} placeholder="Detalle (opcional)" onChange={(e) => cambiar({ detalle: e.target.value })} />
              </div>
            )} />
        </Seccion>

        <Seccion titulo="Observaciones">
          <textarea rows={4} value={hdr.observaciones} placeholder="Ingresos, pulseras, proveedores externos, guardado en depósito…"
            onChange={(e) => set({ observaciones: e.target.value })} />
        </Seccion>

        <Seccion titulo="Otras secciones" ayuda="Para lo que no entra arriba: estacionamiento, sustentabilidad, acreditación…">
          <Lista items={hdr.secciones} editable={editable} textoAgregar="+ Sección" nuevo={() => ({ titulo: '', texto: '' })}
            onCambiar={(secciones) => set({ secciones })}
            render={(sc, cambiar) => (
              <div className="hr-libre">
                <input value={sc.titulo} placeholder="Título" onChange={(e) => cambiar({ titulo: e.target.value })} />
                <textarea rows={3} value={sc.texto} onChange={(e) => cambiar({ texto: e.target.value })} />
              </div>
            )} />
        </Seccion>
      </fieldset>

      {datos.versiones.length > 0 && (
        <Seccion titulo="Versiones enviadas">
          <ol className="hr-versiones">
            {datos.versiones.map((v) => (
              <li key={v.id}>
                <strong>v{v.version}</strong> · {fechaHora(v.created_at)} · {v.enviada_por}
                <div className="hr-ayuda">{v.cambios}{v.nota ? ` · ${v.nota}` : ''}</div>
              </li>
            ))}
          </ol>
        </Seccion>
      )}

      {editable && sucio && (
        <div className="hr-flotante">
          <span>Hay cambios sin guardar</span>
          <button className="pc-btn primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      )}
    </div>
  );
}
