import { useCallback, useEffect, useMemo, useState } from 'react'
import { login, clearSession, getToken, getUsers, createUser, deleteUser, toggleUser, isDemoMode } from './services/strService'
import { useSTRs } from './hooks/useSTRs'
import { useNotifications } from './hooks/useNotifications'
import { isMuted, setMuted } from './services/notificationSound'
import './App.css'

const statusStyles = {
  Pendiente: 'status status-pending',
  Aprobada: 'status status-approved',
  'No Aprobada': 'status status-rejected',
}

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>,
    x: <><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    eye: <><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.7-4L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14.7 4L20 15" /><path d="M20 20v-5h-5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" /><path d="M17 5.3a3.4 3.4 0 0 1 0 5.4M18.5 14.8c2 .7 3 2.4 3 5.2" /></>,
    box: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    soundOn: <><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /></>,
    soundOff: <><path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function StatusBadge({ status }) {
  const icon = status === 'Pendiente' ? 'clock' : status === 'Aprobada' ? 'check' : 'x'
  return <span className={statusStyles[status]}><Icon name={icon} size={14} />{status}</span>
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand login-brand"><div className="brand-mark">S</div><div><strong>STR<span>flow</span></strong><small>OPERACIONES</small></div></div>
        <span className="eyebrow">ACCESO OPERATIVO</span>
        <h1>Iniciar sesión</h1>
        <p className="login-description">Ingresa con tu cuenta de gerente para consultar las solicitudes de tu región.</p>
        <label htmlFor="login-email">Correo</label>
        <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="gerente@red.com" required />
        <label htmlFor="login-password">Contraseña</label>
        <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="button button-primary login-submit" disabled={isSubmitting}>{isSubmitting ? 'Validando...' : 'Ingresar'}</button>
        <small className="login-help">Acceso exclusivo para gerentes autorizados.</small>
      </form>
    </main>
  )
}

function ApprovalModal({ str, onClose, onSend, error }) {
  const [additionalInfo, setAdditionalInfo] = useState('')
  // idle -> sending -> sent. El estado 'sent' se queda visible un momento para
  // que la animacion de exito se alcance a leer antes de cerrar el modal.
  const [phase, setPhase] = useState('idle')

  async function handleSend(event) {
    event.preventDefault()
    if (phase !== 'idle') return

    setPhase('sending')
    const ok = await onSend(additionalInfo)
    setPhase(ok ? 'sent' : 'idle')
  }

  const isBusy = phase !== 'idle'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isBusy && onClose()}>
      <section className={`modal${phase === 'sent' ? ' is-sent' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        {phase === 'sent' ? (
          <div className="send-success" role="status" aria-live="assertive">
            <svg className="success-mark" viewBox="0 0 52 52" aria-hidden="true">
              <circle className="success-ring" cx="26" cy="26" r="24" />
              <path className="success-tick" d="M15 27l7.5 7.5L38 19" />
            </svg>
            <h2>El correo se ha enviado con éxito</h2>
            <p>La solicitud <strong>{str.id}</strong> quedó en manos de Eduardo. Te avisamos aquí mismo en cuanto responda.</p>
            <div className="success-steps">
              <span className="done"><Icon name="check" size={12} /> Correo entregado</span>
              <span className="waiting"><Icon name="clock" size={12} /> Esperando respuesta</span>
            </div>
            <button type="button" className="button button-primary" onClick={onClose}>Entendido</button>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Flujo de aprobación</span>
                <h2 id="modal-title">Llevar a aprobación</h2>
              </div>
              <button className="icon-button" onClick={onClose} aria-label="Cerrar modal" disabled={isBusy}><Icon name="close" /></button>
            </div>
            <div className="modal-str-card">
              <div className="file-icon"><Icon name="file" size={20} /></div>
              <div><strong>{str.id}</strong><span>{str.cliente} · {str.detalleSTR}</span></div>
            </div>
            <form onSubmit={handleSend}>
              <label htmlFor="additional-info">Información adicional <span>(opcional)</span></label>
              <textarea id="additional-info" value={additionalInfo} onChange={(event) => setAdditionalInfo(event.target.value)} disabled={isBusy} placeholder="Escribe o pega aquí la información que Eduardo necesita para revisar esta solicitud..." />
              <p className="helper-text">Se enviará un correo real a <strong>Eduardo</strong> con el detalle completo y botones para aprobar o rechazar.</p>
              {error && <p className="modal-error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={onClose} disabled={isBusy}>Cancelar</button>
                <button type="submit" className={`button button-primary${phase === 'sending' ? ' is-loading' : ''}`} disabled={isBusy}>
                  {phase === 'sending'
                    ? <><span className="spinner" aria-hidden="true" /> Enviando correo...</>
                    : <>Enviar a gerente <Icon name="arrow" size={16} /></>}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

function InvoiceDetailsModal({ str, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Información de factura</span>
            <h2 id="invoice-modal-title">Detalle de la solicitud</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar detalles"><Icon name="close" /></button>
        </div>
        <div className="invoice-summary">
          <div className="file-icon"><Icon name="file" size={20} /></div>
          <div><strong>Traslado {str.documento}</strong><span>{str.cliente} · {str.id}</span></div>
          <StatusBadge status={str.estado} />
        </div>
        <div className="invoice-total"><span>Total de unidades</span><strong>{str.totalCantidad} en {str.totalLineas} línea(s)</strong></div>
        <div className="invoice-details-grid">
          <div><span>Número de STR</span><strong>{str.id}</strong></div>
          <div><span>País</span><strong>{str.pais === 'GT' ? 'Guatemala' : 'El Salvador'}</strong></div>
          <div><span>Cliente</span><strong>{str.cliente}</strong></div>
          <div><span>Código de cliente</span><strong>{str.clienteCodigo}</strong></div>
          <div><span>Fecha</span><strong>{str.fecha}</strong></div>
          <div><span>Bodega origen</span><strong>{str.bodegaOrigen}</strong></div>
          <div><span>Bodega destino</span><strong>{str.bodegaDestino}</strong></div>
          <div><span>Tipo de solicitud</span><strong>{str.tipoSolicitud}</strong></div>
        </div>
        <div className="invoice-description">
          <span>Artículos del traslado</span>
          <table className="items-table">
            <thead><tr><th>Modelo</th><th>Descripción</th><th>Cantidad</th></tr></thead>
            <tbody>{str.items.map((item, index) => <tr key={item.modelo + index}><td>{item.modelo}</td><td>{item.descripcion}</td><td>{item.cantidad}</td></tr>)}</tbody>
          </table>
        </div>
        {str.historial.length > 0 && (
          <div className="approval-trail">
            <span>Historial de aprobación</span>
            <ol>
              {[...str.historial].reverse().map((entry, index) => (
                <li key={entry.at + index} className={entry.status === 'Aprobada' ? 'ok' : 'no'}>
                  <div className="trail-dot"><Icon name={entry.status === 'Aprobada' ? 'check' : 'x'} size={12} /></div>
                  <div>
                    <strong>{entry.status}</strong>
                    <span>{new Date(entry.at).toLocaleString('es-GT')} · {entry.via === 'correo' ? 'por correo' : 'desde el panel'}</span>
                    <span>{entry.by || 'usuario no registrado'}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cerrar</button></div>
      </section>
    </div>
  )
}

function UsersModal({ currentUser, onClose, onToast }) {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'GERENTE_REGIONAL', country: 'GT',
  })
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const demoMode = isDemoMode()

  const refresh = useCallback(async () => {
    try {
      setUsers(await getUsers())
    } catch (caught) {
      setError(caught.message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!userToDelete) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isDeleting) setUserToDelete(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [userToDelete, isDeleting])

  const update = (field) => (event) => setForm((c) => ({ ...c, [field]: event.target.value }))

  async function handleCreate(event) {
    event.preventDefault()
    setError('')
    setIsSaving(true)
    try {
      const payload = { ...form }
      if (payload.role === 'GERENTE_GENERAL') payload.country = null
      await createUser(payload)
      setForm({ name: '', email: '', password: '', role: 'GERENTE_REGIONAL', country: 'GT' })
      await refresh()
      onToast(`Usuario ${payload.email} creado correctamente.`)
    } catch (caught) {
      setError(caught.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmDelete() {
    if (!userToDelete || isDeleting) return
    const user = userToDelete
    setDeleteError('')
    setIsDeleting(true)
    try {
      await deleteUser(user._id)
      setUserToDelete(null)
      await refresh()
      onToast(`Usuario ${user.email} eliminado.`)
    } catch (caught) {
      setDeleteError(caught.message)
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleToggle(user) {
    try {
      await toggleUser(user._id, !user.active)
      await refresh()
    } catch (caught) {
      setError(caught.message)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="modal users-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">ADMINISTRACIÓN</span>
            <h2>Usuarios del sistema</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        {demoMode && (
          <p className="demo-notice">
            Modo demo: los cambios se guardan en este navegador y no crean cuentas reales.
            Configura <code>DEMO_MODE=false</code> para administrar usuarios del sistema.
          </p>
        )}

        <form className="user-form" onSubmit={handleCreate}>
          <label>Nombre completo
            <input value={form.name} onChange={update('name')} placeholder="Ana Pérez" required />
          </label>
          <label>Correo
            <input type="email" value={form.email} onChange={update('email')} placeholder="ana@red.com" required />
          </label>
          <label>Contraseña
            <input type="password" value={form.password} onChange={update('password')} placeholder="Mínimo 8 caracteres" minLength={8} required />
          </label>
          <label>Rol
            <select value={form.role} onChange={update('role')}>
              <option value="GERENTE_REGIONAL">Gerente regional</option>
              <option value="GERENTE_GENERAL">Gerente general</option>
            </select>
          </label>
          {form.role === 'GERENTE_REGIONAL' && (
            <label>País asignado
              <select value={form.country} onChange={update('country')}>
                <option value="GT">Guatemala</option>
                <option value="SV">El Salvador</option>
              </select>
            </label>
          )}
          {error && <p className="modal-error full" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="submit" className="button button-primary" disabled={isSaving}>
              <Icon name="check" size={16} /> {isSaving ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>

        <div className="users-list">
          {users.map((user) => (
            <div className={`user-row${user.active ? '' : ' inactive'}`} key={user._id}>
              <div className="avatar">{user.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}{user.country ? ` · ${user.country}` : ''}</span>
              </div>
              <span className={`role-pill${user.role === 'GERENTE_REGIONAL' ? ' regional' : ''}`}>
                {user.role === 'GERENTE_GENERAL' ? 'General' : 'Regional'}
              </span>
              <div className="row-actions">
                <button
                  className="row-action"
                  onClick={() => handleToggle(user)}
                  disabled={user.email === currentUser.email}
                  title={user.email === currentUser.email ? 'No puedes desactivar tu propia cuenta.' : undefined}
                >
                  {user.active ? 'Desactivar' : 'Activar'}
                </button>
                {user.email !== currentUser.email && (
                  <button className="row-action" onClick={() => { setDeleteError(''); setUserToDelete(user) }}>
                    <Icon name="x" size={13} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {userToDelete && (
          <div
            className="confirm-backdrop"
            onClick={(event) => {
              event.stopPropagation()
              if (event.target === event.currentTarget && !isDeleting) setUserToDelete(null)
            }}
          >
            <section
              className="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-user-title"
              aria-describedby="delete-user-description"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="confirm-dialog-icon"><Icon name="x" size={20} /></span>
              <h3 id="delete-user-title">¿Eliminar usuario?</h3>
              <p id="delete-user-description">
                ¿Seguro que quieres eliminar a <strong>{userToDelete.email}</strong>? Esta acción no se puede deshacer.
              </p>
              {deleteError && <p className="modal-error" role="alert">{deleteError}</p>}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeleting}
                  autoFocus
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                >
                  <Icon name="x" size={15} /> {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}

function fechaLarga(value) {
  if (!value) return 'Sin fecha'
  return new Date(value).toLocaleString('es-GT', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// El porque de una decision: quien, cuando, con que usuario de SAP y el motivo
// que escribio. Solo tiene sentido para solicitudes ya decididas.
function ApprovalDetailsModal({ str, onClose }) {
  const aprobada = str.estado === 'Aprobada'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal approval-detail" role="dialog" aria-modal="true" aria-labelledby="aprobacion-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Detalle de aprobación</span>
            <h2 id="aprobacion-title">{str.id}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className={`decision-banner${aprobada ? '' : ' is-rejected'}`}>
          <span className="decision-icon"><Icon name={aprobada ? 'check' : 'x'} size={22} /></span>
          <div>
            <strong>{str.estado}</strong>
            <span>{fechaLarga(str.decididoEn)}</span>
          </div>
        </div>

        <dl className="decision-facts">
          <div><dt>Decidido por</dt><dd>{str.decididoPor || 'Sin registrar'}</dd></div>
          <div><dt>Vía</dt><dd>{str.decididoVia || 'Sin registrar'}</dd></div>
          <div><dt>Usuario de SAP</dt><dd>{str.usuarioSap || 'Sin registrar'}</dd></div>
          <div><dt>Registro en SAP</dt><dd>{SAP_LABEL[str.estadoSap] ?? 'Sin registrar'}</dd></div>
        </dl>

        <div className="decision-reason">
          <span className="eyebrow">Motivo</span>
          {str.motivo
            ? <blockquote>{str.motivo}</blockquote>
            : <p className="decision-empty">No se escribió un motivo para esta decisión.</p>}
        </div>

        {str.historial?.length > 1 && (
          <div className="decision-history">
            <span className="eyebrow">Historial</span>
            <ul>
              {str.historial.map((item, index) => (
                <li key={`${item.at}-${index}`}>
                  <strong>{item.previousStatus} → {item.status}</strong>
                  <span>{fechaLarga(item.at)}{item.by ? ` · ${item.by}` : ''}</span>
                  {item.note && <p>{item.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="button button-primary" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}

// Lo que respondio SAP, en palabras.
const SAP_LABEL = {
  ok: 'Registrado en SAP',
  ya_autorizado: 'SAP ya lo tenía registrado',
  simulado: 'Simulado (SAP no conectado)',
}

const NOTIFICATION_ICON = {
  success: 'check', priority: 'bell', error: 'x', info: 'bell',
}

// Una decision sobre un traslado es lo mas importante que pasa en la app, asi
// que no se queda en una esquina: toma la pantalla y exige un acuse.
function PriorityAlert({ notification, onClose, onVerDetalle }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const approved = notification.outcome !== 'No Aprobada'

  return (
    <div className="priority-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className={`priority-alert${approved ? '' : ' is-rejected'}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="priority-title"
      >
        <button className="priority-close" onClick={onClose} aria-label="Cerrar aviso"><Icon name="close" size={17} /></button>

        <div className="priority-mark">
          <span className="priority-pulse" aria-hidden="true" />
          <span className="priority-pulse delayed" aria-hidden="true" />
          <span className="priority-icon"><Icon name={approved ? 'check' : 'x'} size={34} /></span>
        </div>

        <span className="priority-eyebrow">Respuesta de aprobación</span>
        <h2 id="priority-title">{notification.title}</h2>
        <p className="priority-message">{notification.message}</p>
        {notification.detail && <span className="priority-detail">{notification.detail}</span>}

        {notification.decidedBy && (
          <p className="priority-by">Decidido por <strong>{notification.decidedBy}</strong></p>
        )}

        {notification.motivo && (
          <blockquote className="priority-motivo">
            <span>Motivo</span>
            {notification.motivo}
          </blockquote>
        )}

        <div className="priority-actions">
          {onVerDetalle && (
            <button className="button button-secondary" onClick={onVerDetalle}>Ver detalle</button>
          )}
          <button className="button button-primary" onClick={onClose}>Entendido</button>
        </div>
      </section>
    </div>
  )
}

function NotificationCenter({ notifications, onDismiss }) {
  return (
    <div className="notification-stack" role="region" aria-label="Avisos en pantalla" aria-live="polite">
      {notifications.filter((item) => item.variant !== 'priority').map((item) => (
        <article
          key={item.id}
          className={`notification notification-${item.variant}`}
          role={item.variant === 'error' ? 'alert' : 'status'}
        >
          <span className="notification-icon"><Icon name={NOTIFICATION_ICON[item.variant] ?? 'bell'} size={16} /></span>
          <div className="notification-body">
            {item.title && <strong>{item.title}</strong>}
            {item.message && <p>{item.message}</p>}
            {item.detail && <span className="notification-detail">{item.detail}</span>}
          </div>
          <button className="notification-close" onClick={() => onDismiss(item.id)} aria-label="Descartar notificación">
            <Icon name="close" size={13} />
          </button>
          <span className="notification-progress" />
        </article>
      ))}
    </div>
  )
}

// "hace 2 min" se lee mejor que una hora exacta para algo que acaba de pasar.
function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'ahora mismo'
  if (seconds < 60) return `hace ${seconds} s`

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  return new Date(timestamp).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })
}

function NotificationHistory({ history, unread, onMarkAllRead, onClear, onClose }) {
  // Cerrar con Escape y con un clic afuera: el panel no debe atrapar al usuario.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="history-overlay" role="presentation" onMouseDown={onClose} />
      <section className="history-panel" role="dialog" aria-label="Historial de notificaciones">
        <header className="history-head">
          <div>
            <strong>Notificaciones</strong>
            <span>{unread ? `${unread} sin leer` : 'Todo al día'}</span>
          </div>
          <div className="history-head-actions">
            {unread > 0 && <button onClick={onMarkAllRead}>Marcar leídas</button>}
            {history.length > 0 && <button onClick={onClear}>Limpiar</button>}
          </div>
        </header>

        {history.length === 0 ? (
          <div className="history-empty">
            <span className="history-empty-icon"><Icon name="bell" size={20} /></span>
            <strong>Sin notificaciones</strong>
            <p>Cuando se envíe un correo o Eduardo responda una solicitud, lo verás aquí.</p>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.id} className={`history-item history-${item.variant}${item.read ? '' : ' is-unread'}`}>
                <span className="history-icon"><Icon name={NOTIFICATION_ICON[item.variant] ?? 'bell'} size={14} /></span>
                <div className="history-body">
                  {item.title && <strong>{item.title}</strong>}
                  {item.message && <p>{item.message}</p>}
                  {item.detail && <span className="history-detail">{item.detail}</span>}
                </div>
                <time dateTime={new Date(item.at).toISOString()}>{relativeTime(item.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function App() {
  const [user, setUser] = useState(() => {
    if (import.meta.env.VITE_DEMO_MODE !== 'false') return {
      email: 'demo@strflow.local',
      name: 'Usuario demo',
      role: 'GERENTE_GENERAL',
      country: null,
    }

    try {
      // Una sesion guardada por una version anterior no trae JWT: sin token
      // la tabla quedaria vacia sin explicacion, asi que se exige re-login.
      if (!getToken()) {
        localStorage.removeItem('strflow-user')
        return null
      }
      return JSON.parse(localStorage.getItem('strflow-user')) || null
    } catch {
      return null
    }
  })
  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('strflow-user')
    setUser(null)
  }, [])
  const {
    notifications, history, unread, notify, dismiss, markAllRead, clearHistory,
  } = useNotifications()
  const [showHistory, setShowHistory] = useState(false)
  // Solo una a la vez: si llegan dos decisiones juntas, se atienden en orden.
  const priorityAlert = notifications.find((item) => item.variant === 'priority')
  const [muted, setMutedState] = useState(() => isMuted())

  // Abrir el panel es haber visto los avisos, asi que se marcan como leidos.
  function toggleHistory() {
    setShowHistory((current) => {
      if (!current) markAllRead()
      return !current
    })
  }

  function toggleSound() {
    setMutedState((current) => {
      setMuted(!current)
      return !current
    })
  }

  // Lo que se decide desde el correo entra por aqui: es la novedad que el
  // usuario no provoco, asi que va como aviso prioritario y con sonido.
  const handleStatusChange = useCallback((str, previousStatus) => {
    const approved = str.estado === 'Aprobada'
    notify({
      variant: 'priority',
      sound: approved ? 'success' : 'error',
      title: approved ? 'Solicitud aprobada' : 'Solicitud no aprobada',
      message: `${str.id} · ${str.cliente}`,
      detail: `${previousStatus} → ${str.estado}`,
      decidedBy: str.decididoPor,
      motivo: str.motivo,
      outcome: str.estado,
      // Para poder abrir el detalle completo desde el aviso.
      strId: str.id,
    })
  }, [notify])

  const { strs, isLoading, error, requestApproval, reload, sync } = useSTRs(handleSessionExpired, handleStatusChange)
  const [selectedSTR, setSelectedSTR] = useState(null)
  const [detailSTR, setDetailSTR] = useState(null)
  const [approvalSTR, setApprovalSTR] = useState(null)
  const [showUsers, setShowUsers] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('strflow-sidebar') === 'collapsed' } catch { return false }
  })

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current
      try { localStorage.setItem('strflow-sidebar', next ? 'collapsed' : 'open') } catch { /* ignore */ }
      return next
    })
  }
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todas')
  const [countryFilter, setCountryFilter] = useState('Todos')
  const [clientFilter, setClientFilter] = useState('Todos')
  const [responsibleFilter, setResponsibleFilter] = useState('Todos')
  const [sendError, setSendError] = useState('')

  async function handleLogin(email, password) {
    const authenticatedUser = await login(email, password)
    localStorage.setItem('strflow-user', JSON.stringify(authenticatedUser))
    setUser(authenticatedUser)
    await reload()
  }

  function logout() {
    clearSession()
    localStorage.removeItem('strflow-user')
    setUser(null)
  }

  const visibleSTRs = user?.role === 'GERENTE_GENERAL' ? strs : strs.filter((str) => str.pais === user?.country)

  const filteredSTRs = useMemo(() => visibleSTRs.filter((str) => {
    const matchesId = str.id.toLowerCase().includes(search.toLowerCase())
    const matchesCountry = countryFilter === 'Todos' || str.pais === countryFilter
    const matchesClient = clientFilter === 'Todos' || str.cliente === clientFilter
    const matchesResponsible = responsibleFilter === 'Todos' || str.tipoSolicitud === responsibleFilter
    return matchesId && matchesCountry && matchesClient && matchesResponsible && (filter === 'Todas' || str.estado === filter)
  }), [visibleSTRs, search, filter, countryFilter, clientFilter, responsibleFilter])

  const counts = useMemo(() => ({
    total: visibleSTRs.length,
    pending: visibleSTRs.filter((str) => str.estado === 'Pendiente').length,
    approved: visibleSTRs.filter((str) => str.estado === 'Aprobada').length,
    rejected: visibleSTRs.filter((str) => str.estado === 'No Aprobada').length,
  }), [visibleSTRs])

  const filterOptions = useMemo(() => ({
    countries: [...new Set(visibleSTRs.map((str) => str.pais))],
    clients: [...new Set(visibleSTRs.map((str) => str.cliente))].sort(),
    responsibles: [...new Set(visibleSTRs.map((str) => str.tipoSolicitud))].sort(),
  }), [visibleSTRs])

  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)

  // Al cambiar un filtro hay que volver al inicio: si no, se queda en una
  // página que el nuevo listado ya no tiene.
  useEffect(() => {
    setPage(1)
  }, [search, filter, countryFilter, clientFilter, responsibleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredSTRs.length / PAGE_SIZE))
  // Si los filtros reducen el listado, no quedarse en una pagina que ya no existe.
  const currentPage = Math.min(page, totalPages)
  const pageSTRs = useMemo(
    () => filteredSTRs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredSTRs, currentPage],
  )

  // Ventana de hasta 5 numeros alrededor de la pagina actual.
  const pageNumbers = useMemo(() => {
    const span = 5
    let first = Math.max(1, currentPage - Math.floor(span / 2))
    const last = Math.min(totalPages, first + span - 1)
    first = Math.max(1, last - span + 1)
    return Array.from({ length: last - first + 1 }, (unused, index) => first + index)
  }, [currentPage, totalPages])

  const goTo = useCallback((target) => {
    setPage(Math.min(Math.max(1, target), totalPages))
  }, [totalPages])

  const hasActiveFilters = search !== '' || filter !== 'Todas' || countryFilter !== 'Todos'
    || clientFilter !== 'Todos' || responsibleFilter !== 'Todos'

  function clearFilters() {
    setSearch('')
    setFilter('Todas')
    setCountryFilter('Todos')
    setClientFilter('Todos')
    setResponsibleFilter('Todos')
  }

  function openApproval(str) {
    setSelectedSTR(str)
    setSendError('')
  }

  // Devuelve true/false: el modal usa el resultado para pasar a su pantalla
  // de exito en vez de cerrarse de golpe.
  async function sendEmail(additionalInfo) {
    try {
      setSendError('')
      await requestApproval(selectedSTR, additionalInfo)
      notify({
        variant: 'success',
        title: 'Correo enviado',
        message: `${selectedSTR.id} salió a aprobación.`,
      })
      return true
    } catch (requestError) {
      setSendError(requestError.message)
      notify({ variant: 'error', title: 'No se pudo enviar', message: requestError.message })
      return false
    }
  }

  const [isSyncing, setIsSyncing] = useState(false)

  // El gerente general dispara una consulta real a la API externa; los
  // regionales no tienen ese permiso, así que solo releen la base.
  async function refreshSTRs() {
    setIsSyncing(true)
    try {
      if (user.role === 'GERENTE_GENERAL') {
        const summary = await sync()
        const nuevos = summary.upserted
          ? `${summary.upserted} traslado(s) nuevo(s) desde la API.`
          : 'Sin traslados nuevos en la API.'
        const ausentes = summary.missing ? ` ${summary.missing} dejaron de venir.` : ''
        notify({ variant: 'success', title: 'Sincronización lista', message: `${nuevos}${ausentes}` })
      } else {
        await reload()
        notify({ variant: 'success', title: 'Listado actualizado', message: 'Ya estás viendo la última versión.' })
      }
    } catch (caught) {
      notify({ variant: 'error', title: 'No se pudo actualizar', message: caught.message })
    } finally {
      setIsSyncing(false)
    }
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>STR<span>flow</span></strong><small>OPERACIONES</small></div></div>
        <nav className="side-nav" aria-label="Navegación principal">
          <span className="nav-label">GESTIÓN</span>
          <a className="nav-item active" href="#dashboard" data-label="Solicitudes STR"><span className="nav-icon"><Icon name="file" size={17} /></span><span className="nav-text">Solicitudes STR</span> <b>{counts.pending}</b></a>
          <span className="nav-label nav-label-spaced">SISTEMA</span>
          {user.role === 'GERENTE_GENERAL' && <a className={`nav-item${showUsers ? ' active' : ''}`} href="#usuarios" data-label="Usuarios" onClick={(event) => { event.preventDefault(); setShowUsers(true) }}><span className="nav-icon"><Icon name="users" size={17} /></span><span className="nav-text">Usuarios</span></a>}
        </nav>
        <div className="sidebar-bottom"><div className="support-card"><span>¿Necesitas ayuda?</span><a href="#soporte">Visitar soporte <Icon name="arrow" size={13} /></a></div><div className="profile"><div className="avatar">GR</div><div><strong>{user.name}</strong><span>{user.role === 'GERENTE_GENERAL' ? 'Acceso global' : `Gerencia ${user.country}`}</span></div><button className="logout-button" onClick={logout}>Salir</button></div></div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar"><button className="icon-button sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} title={collapsed ? 'Expandir menú' : 'Contraer menú'}><Icon name="menu" size={19} /></button><div className="breadcrumb">Operaciones <span>/</span> <strong>Solicitudes STR</strong></div><div className="topbar-actions">
            <button className="icon-button" onClick={toggleSound} aria-label={muted ? 'Activar sonido de notificaciones' : 'Silenciar notificaciones'} title={muted ? 'Sonido desactivado' : 'Sonido activado'}>
              <Icon name={muted ? 'soundOff' : 'soundOn'} size={19} />
            </button>
            <div className="bell-wrap">
              <button
                className={`icon-button bell-button${unread ? ' has-unread' : ''}${showHistory ? ' is-open' : ''}`}
                onClick={toggleHistory}
                aria-label={unread ? `${unread} notificaciones sin leer` : 'Notificaciones'}
                aria-expanded={showHistory}
              >
                <Icon name="bell" size={19} />
                {unread > 0 && <span className="unread-count">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {showHistory && (
                <NotificationHistory
                  history={history}
                  unread={unread}
                  onMarkAllRead={markAllRead}
                  onClear={clearHistory}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </div>
          </div></header>
        <div className="content">
          <div className="page-heading"><div><span className="eyebrow">CENTRO DE CONTROL</span><h1>Solicitudes STR</h1><p>Gestiona y da seguimiento a las solicitudes de tus clientes.</p></div><button className="button button-primary" onClick={refreshSTRs} disabled={isLoading || isSyncing}><Icon name="refresh" size={16} /> {isSyncing ? 'Consultando la API...' : isLoading ? 'Cargando...' : 'Actualizar'}</button></div>
          <section className="stats-grid" aria-label="Resumen de solicitudes">
            <div className="stat-card"><div className="stat-top"><span>Total de solicitudes</span><div className="stat-icon blue"><Icon name="file" size={18} /></div></div><strong>{counts.total}</strong><small><span className="neutral-dot" /> Todas las solicitudes</small></div>
            <div className="stat-card"><div className="stat-top"><span>Pendientes de aprobación</span><div className="stat-icon amber"><Icon name="clock" size={18} /></div></div><strong>{counts.pending}</strong><small><span className="amber-dot" /> Requieren tu atención</small></div>
            <div className="stat-card"><div className="stat-top"><span>Aprobadas</span><div className="stat-icon green"><Icon name="check" size={18} /></div></div><strong>{counts.approved}</strong><small><span className="green-dot" /> Listas para avanzar</small></div>
            <div className="stat-card"><div className="stat-top"><span>No aprobadas</span><div className="stat-icon red"><Icon name="x" size={18} /></div></div><strong>{counts.rejected}</strong><small><span className="red-dot" /> Requieren revisión</small></div>
          </section>
          <section className="table-panel">
            <div className="panel-heading"><div><h2>Solicitudes recientes</h2><p>Filtra, consulta y gestiona las aprobaciones.</p></div><span className="result-count">{filteredSTRs.length} resultados</span></div>
            <div className="toolbar" aria-label="Filtros de solicitudes">
              <div className="toolbar-search">
                <Icon name="search" size={16} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por ID de solicitud..." aria-label="Buscar por ID de solicitud" />
                {search && <button className="clear-input" onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><Icon name="close" size={13} /></button>}
              </div>

              <div className="segmented" role="group" aria-label="Filtrar por estado">
                {[['Todas', counts.total], ['Pendiente', counts.pending], ['Aprobada', counts.approved], ['No Aprobada', counts.rejected]].map(([item, count]) => (
                  <button key={item} className={`segment${filter === item ? ' active' : ''}`} onClick={() => setFilter(item)} aria-pressed={filter === item}>
                    {item}<b>{count}</b>
                  </button>
                ))}
              </div>

              <div className="toolbar-selects">
                {user.role === 'GERENTE_GENERAL' && (
                  <select className={countryFilter !== 'Todos' ? 'is-set' : ''} value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} aria-label="Filtrar por país">
                    <option value="Todos">Todos los países</option>
                    {filterOptions.countries.map((country) => <option key={country} value={country}>{country === 'GT' ? 'Guatemala' : 'El Salvador'}</option>)}
                  </select>
                )}
                <select className={clientFilter !== 'Todos' ? 'is-set' : ''} value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} aria-label="Filtrar por cliente">
                  <option value="Todos">Todos los clientes</option>
                  {filterOptions.clients.map((client) => <option key={client} value={client}>{client}</option>)}
                </select>
                <select className={responsibleFilter !== 'Todos' ? 'is-set' : ''} value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} aria-label="Filtrar por tipo">
                  <option value="Todos">Todos los tipos</option>
                  {filterOptions.responsibles.map((responsible) => <option key={responsible} value={responsible}>{responsible}</option>)}
                </select>
                {hasActiveFilters && (
                  <button className="clear-filters" onClick={clearFilters}>
                    <Icon name="close" size={13} /> Limpiar
                  </button>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table><thead><tr><th>Solicitud STR</th><th>Cliente</th><th>Detalle de la solicitud</th><th>Estado</th><th>Fecha</th><th><span className="sr-only">Acción</span></th></tr></thead>
                <tbody>{isLoading ? <tr><td colSpan="6" className="empty-state">Cargando solicitudes...</td></tr> : error ? <tr><td colSpan="6" className="empty-state error-text">{error}</td></tr> : filteredSTRs.length === 0 ? <tr><td colSpan="6" className="empty-state">No hay solicitudes que coincidan con tu búsqueda.</td></tr> : pageSTRs.map((str) => (
                  // data-label alimenta las etiquetas del modo tarjeta: en
                  // pantallas angostas la tabla deja de ser tabla.
                  <tr key={str.id}>
                    <td data-label="Solicitud">
                      <strong className="str-id">{str.id}</strong>
                      <span className="responsible">{str.ruta}</span>
                    </td>
                    <td data-label="Cliente">
                      <div className="client-cell">
                        <span className="client-avatar">{str.clienteIniciales}</span>
                        <span className="client-name">{str.cliente}</span>
                      </div>
                    </td>
                    <td className="detail-cell" data-label="Detalle">{str.detalleSTR}</td>
                    <td data-label="Estado"><StatusBadge status={str.estado} /></td>
                    <td className="date-cell" data-label="Fecha">{str.fecha}</td>
                    <td className="actions-cell">
                      <div className="row-actions">
                        <button
                          className="row-action details-action icon-only"
                          onClick={() => setDetailSTR(str)}
                          aria-label={`Ver detalles de ${str.id}`}
                          title="Ver detalles"
                        >
                          <Icon name="eye" size={15} />
                        </button>
                        {str.estado !== 'Pendiente' && (
                          <button className="row-action decision-action" onClick={() => setApprovalSTR(str)}>
                            <Icon name="file" size={14} /> Ver decisión
                          </button>
                        )}
                        {str.estado !== 'Aprobada' && (
                          <button className="row-action" onClick={() => openApproval(str)}>
                            Aprobación <Icon name="arrow" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {filteredSTRs.length === 0
                  ? 'Sin resultados'
                  : <>Mostrando <strong>{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredSTRs.length)}</strong> de <strong>{filteredSTRs.length}</strong> solicitudes</>}
              </span>
              <div className="pagination">
                <button onClick={() => goTo(1)} disabled={currentPage === 1} aria-label="Primera página" title="Primera página">«</button>
                <button onClick={() => goTo(currentPage - 1)} disabled={currentPage === 1} aria-label="Página anterior" title="Página anterior">‹</button>
                {pageNumbers[0] > 1 && <span className="page-gap">…</span>}
                {pageNumbers.map((number) => (
                  <button
                    key={number}
                    className={number === currentPage ? 'current-page' : ''}
                    onClick={() => goTo(number)}
                    aria-current={number === currentPage ? 'page' : undefined}
                  >{number}</button>
                ))}
                {pageNumbers[pageNumbers.length - 1] < totalPages && <span className="page-gap">…</span>}
                <button onClick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Página siguiente" title="Página siguiente">›</button>
                <button onClick={() => goTo(totalPages)} disabled={currentPage === totalPages} aria-label="Última página" title="Última página">»</button>
              </div>
            </div>
          </section>
        </div>
      </main>
      {selectedSTR && <ApprovalModal str={selectedSTR} error={sendError} onClose={() => setSelectedSTR(null)} onSend={sendEmail} />}
      {detailSTR && <InvoiceDetailsModal str={detailSTR} onClose={() => setDetailSTR(null)} />}
      {approvalSTR && <ApprovalDetailsModal str={approvalSTR} onClose={() => setApprovalSTR(null)} />}
      {showUsers && <UsersModal currentUser={user} onClose={() => setShowUsers(false)} onToast={(message) => notify({ variant: 'success', message })} />}
      <NotificationCenter notifications={notifications} onDismiss={dismiss} />
      {priorityAlert && (
        <PriorityAlert
          notification={priorityAlert}
          onClose={() => dismiss(priorityAlert.id)}
          onVerDetalle={() => {
            const str = strs.find((item) => item.id === priorityAlert.strId)
            if (str) setApprovalSTR(str)
            dismiss(priorityAlert.id)
          }}
        />
      )}
    </div>
  )
}

export default App
