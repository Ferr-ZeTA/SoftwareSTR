import { useCallback, useEffect, useMemo, useState } from 'react'
import { login, clearSession, getToken, getUsers, createUser, deleteUser, toggleUser } from './services/strService'
import { useSTRs } from './hooks/useSTRs'
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

  function handleSend(event) {
    event.preventDefault()
    onSend(additionalInfo)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Flujo de aprobación</span>
            <h2 id="modal-title">Llevar a aprobación</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar modal"><Icon name="close" /></button>
        </div>
        <div className="modal-str-card">
          <div className="file-icon"><Icon name="file" size={20} /></div>
          <div><strong>{str.id}</strong><span>{str.cliente} · {str.detalleSTR}</span></div>
        </div>
        <form onSubmit={handleSend}>
          <label htmlFor="additional-info">Información adicional <span>(opcional)</span></label>
          <textarea id="additional-info" value={additionalInfo} onChange={(event) => setAdditionalInfo(event.target.value)} placeholder="Escribe o pega aquí la información que Eduardo necesita para revisar esta solicitud..." />
          <p className="helper-text">Se enviará un correo real a <strong>Eduardo</strong> con el detalle completo y botones para aprobar o rechazar.</p>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="button button-primary">Enviar a gerente <Icon name="arrow" size={16} /></button>
          </div>
        </form>
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

  const refresh = useCallback(async () => {
    try {
      setUsers(await getUsers())
    } catch (caught) {
      setError(caught.message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

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

  async function handleDelete(user) {
    if (!window.confirm(`¿Eliminar a ${user.email}? Esta acción no se puede deshacer.`)) return
    try {
      await deleteUser(user._id)
      await refresh()
      onToast(`Usuario ${user.email} eliminado.`)
    } catch (caught) {
      setError(caught.message)
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
                <button className="row-action" onClick={() => handleToggle(user)}>
                  {user.active ? 'Desactivar' : 'Activar'}
                </button>
                {user.email !== currentUser.email && (
                  <button className="row-action" onClick={() => handleDelete(user)}>
                    <Icon name="x" size={13} /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(() => {
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
  const { strs, isLoading, error, requestApproval, reload } = useSTRs(handleSessionExpired)
  const [selectedSTR, setSelectedSTR] = useState(null)
  const [detailSTR, setDetailSTR] = useState(null)
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
  const [toast, setToast] = useState('')
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

  useEffect(() => {
    setPage(1)
  }, [search, filter, countryFilter, clientFilter, responsibleFilter])

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

  async function sendEmail(additionalInfo) {
    try {
      setSendError('')
      await requestApproval(selectedSTR, additionalInfo)
      setToast(`Correo enviado para ${selectedSTR.id}.`)
      setSelectedSTR(null)
      window.setTimeout(() => setToast(''), 3500)
    } catch (requestError) {
      setSendError(requestError.message)
    }
  }

  async function refreshSTRs() {
    await reload()
    setToast('Solicitudes actualizadas correctamente.')
    window.setTimeout(() => setToast(''), 3500)
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>STR<span>flow</span></strong><small>OPERACIONES</small></div></div>
        <nav className="side-nav" aria-label="Navegación principal">
          <span className="nav-label">GESTIÓN</span>
          <a className="nav-item active" href="#dashboard" data-label="Solicitudes STR"><span className="nav-icon"><Icon name="file" size={17} /></span><span className="nav-text">Solicitudes STR</span> <b>{counts.pending}</b></a>
          <a className="nav-item" href="#clientes" data-label="Clientes"><span className="nav-icon"><Icon name="box" size={17} /></span><span className="nav-text">Clientes</span></a>
          <span className="nav-label nav-label-spaced">SISTEMA</span>
          {user.role === 'GERENTE_GENERAL' && <a className="nav-item" href="#usuarios" data-label="Usuarios" onClick={(event) => { event.preventDefault(); setShowUsers(true) }}><span className="nav-icon"><Icon name="users" size={17} /></span><span className="nav-text">Usuarios</span></a>}
          <a className="nav-item" href="#configuracion" data-label="Configuración"><span className="nav-icon"><Icon name="cog" size={17} /></span><span className="nav-text">Configuración</span></a>
        </nav>
        <div className="sidebar-bottom"><div className="support-card"><span>¿Necesitas ayuda?</span><a href="#soporte">Visitar soporte <Icon name="arrow" size={13} /></a></div><div className="profile"><div className="avatar">GR</div><div><strong>{user.name}</strong><span>{user.role === 'GERENTE_GENERAL' ? 'Acceso global' : `Gerencia ${user.country}`}</span></div><button className="logout-button" onClick={logout}>Salir</button></div></div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar"><button className="icon-button sidebar-toggle" onClick={toggleSidebar} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} title={collapsed ? 'Expandir menú' : 'Contraer menú'}><Icon name="menu" size={19} /></button><div className="breadcrumb">Operaciones <span>/</span> <strong>Solicitudes STR</strong></div><div className="topbar-actions"><button className="icon-button notification" aria-label="Notificaciones"><Icon name="bell" size={19} /><i /></button></div></header>
        <div className="content">
          <div className="page-heading"><div><span className="eyebrow">CENTRO DE CONTROL</span><h1>Solicitudes STR</h1><p>Gestiona y da seguimiento a las solicitudes de tus clientes.</p></div><button className="button button-primary" onClick={refreshSTRs} disabled={isLoading}><Icon name="refresh" size={16} /> {isLoading ? 'Actualizando...' : 'Actualizar'}</button></div>
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
                <tbody>{isLoading ? <tr><td colSpan="6" className="empty-state">Cargando solicitudes...</td></tr> : error ? <tr><td colSpan="6" className="empty-state error-text">{error}</td></tr> : filteredSTRs.length === 0 ? <tr><td colSpan="6" className="empty-state">No hay solicitudes que coincidan con tu búsqueda.</td></tr> : pageSTRs.map((str) => <tr key={str.id}><td><strong className="str-id">{str.id}</strong><span className="responsible">{str.ruta}</span></td><td><div className="client-cell"><span className="client-avatar">{str.clienteIniciales}</span>{str.cliente}</div></td><td className="detail-cell">{str.detalleSTR}</td><td><StatusBadge status={str.estado} /></td><td className="date-cell">{str.fecha}</td><td><div className="row-actions"><button className="row-action details-action" onClick={() => setDetailSTR(str)}><Icon name="eye" size={14} /> Ver detalles</button><button className="row-action" onClick={() => openApproval(str)}>Aprobación <Icon name="arrow" size={14} /></button></div></td></tr>)}</tbody>
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
      {showUsers && <UsersModal currentUser={user} onClose={() => setShowUsers(false)} onToast={(message) => { setToast(message); window.setTimeout(() => setToast(''), 3500) }} />}
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  )
}

export default App
