import { useMemo, useState } from 'react'
import { login } from './services/strService'
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
          <div><strong>{str.invoiceNumber}</strong><span>{str.cliente} · {str.id}</span></div>
          <StatusBadge status={str.estado} />
        </div>
        <div className="invoice-total"><span>Total de factura</span><strong>{str.invoiceCurrency} {str.invoiceAmount}</strong></div>
        <div className="invoice-details-grid">
          <div><span>Número de STR</span><strong>{str.id}</strong></div>
          <div><span>País</span><strong>{str.pais === 'GT' ? 'Guatemala' : 'El Salvador'}</strong></div>
          <div><span>Cliente</span><strong>{str.cliente}</strong></div>
          <div><span>Responsable</span><strong>{str.responsable}</strong></div>
          <div><span>Fecha de emisión</span><strong>{str.invoiceIssueDate}</strong></div>
          <div><span>Fecha de vencimiento</span><strong>{str.invoiceDueDate}</strong></div>
          <div><span>Método de pago</span><strong>{str.paymentMethod}</strong></div>
          <div><span>Tipo de servicio</span><strong>{str.serviceType}</strong></div>
        </div>
        <div className="invoice-description"><span>Descripción del servicio</span><p>{str.detalleSTR}</p></div>
        <div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cerrar</button></div>
      </section>
    </div>
  )
}

function App() {
  const { strs, isLoading, error, requestApproval, reload } = useSTRs()
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('strflow-user')) || null
    } catch {
      return null
    }
  })
  const [selectedSTR, setSelectedSTR] = useState(null)
  const [detailSTR, setDetailSTR] = useState(null)
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
  }

  function logout() {
    localStorage.removeItem('strflow-user')
    setUser(null)
  }

  const visibleSTRs = user?.role === 'global' ? strs : strs.filter((str) => str.pais === user?.country)

  const filteredSTRs = useMemo(() => visibleSTRs.filter((str) => {
    const matchesId = str.id.toLowerCase().includes(search.toLowerCase())
    const matchesCountry = countryFilter === 'Todos' || str.pais === countryFilter
    const matchesClient = clientFilter === 'Todos' || str.cliente === clientFilter
    const matchesResponsible = responsibleFilter === 'Todos' || str.responsable === responsibleFilter
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
    responsibles: [...new Set(visibleSTRs.map((str) => str.responsable))].sort(),
  }), [visibleSTRs])

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>STR<span>flow</span></strong><small>OPERACIONES</small></div></div>
        <nav className="side-nav" aria-label="Navegación principal">
          <span className="nav-label">GESTIÓN</span>
          <a className="nav-item active" href="#dashboard"><span className="nav-icon"><Icon name="file" size={17} /></span>Solicitudes STR <b>{counts.pending}</b></a>
          <a className="nav-item" href="#clientes"><span className="nav-icon"><Icon name="file" size={17} /></span>Clientes</a>
          <span className="nav-label nav-label-spaced">SISTEMA</span>
          <a className="nav-item" href="#configuracion"><span className="nav-icon"><Icon name="file" size={17} /></span>Configuración</a>
        </nav>
        <div className="sidebar-bottom"><div className="support-card"><span>¿Necesitas ayuda?</span><a href="#soporte">Visitar soporte <Icon name="arrow" size={13} /></a></div><div className="profile"><div className="avatar">GR</div><div><strong>{user.name}</strong><span>{user.role === 'global' ? 'Acceso global' : `Gerencia ${user.country}`}</span></div><button className="logout-button" onClick={logout}>Salir</button></div></div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar"><div className="breadcrumb">Operaciones <span>/</span> <strong>Solicitudes STR</strong></div><div className="topbar-actions"><button className="icon-button notification" aria-label="Notificaciones"><Icon name="bell" size={19} /><i /></button></div></header>
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
            <div className="excel-filters" aria-label="Filtros de solicitudes">
              <label className="id-search"><span>ID de solicitud</span><div className="filter-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por ID..." aria-label="Buscar por ID de solicitud" /></div></label>
              {user.role === 'global' && <label><span>País</span><select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="Todos">Todos los países</option>{filterOptions.countries.map((country) => <option key={country} value={country}>{country === 'GT' ? 'Guatemala' : 'El Salvador'}</option>)}</select></label>}
              <label><span>Estado</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{['Todas', 'Pendiente', 'Aprobada', 'No Aprobada'].map((item) => <option key={item} value={item}>{item === 'Todas' ? 'Todos los estados' : item}</option>)}</select></label>
              <label><span>Cliente</span><select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="Todos">Todos los clientes</option>{filterOptions.clients.map((client) => <option key={client} value={client}>{client}</option>)}</select></label>
              <label><span>Responsable</span><select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="Todos">Todos los responsables</option>{filterOptions.responsibles.map((responsible) => <option key={responsible} value={responsible}>{responsible}</option>)}</select></label>
              <button className="clear-filters" onClick={clearFilters}>Limpiar filtros</button>
            </div>
            <div className="table-wrap">
              <table><thead><tr><th>Solicitud STR</th><th>Cliente</th><th>Detalle de la solicitud</th><th>Estado</th><th>Fecha</th><th><span className="sr-only">Acción</span></th></tr></thead>
                <tbody>{isLoading ? <tr><td colSpan="6" className="empty-state">Cargando solicitudes...</td></tr> : error ? <tr><td colSpan="6" className="empty-state error-text">{error}</td></tr> : filteredSTRs.length === 0 ? <tr><td colSpan="6" className="empty-state">No hay solicitudes que coincidan con tu búsqueda.</td></tr> : filteredSTRs.map((str) => <tr key={str.id}><td><strong className="str-id">{str.id}</strong><span className="responsible">{str.responsable}</span></td><td><div className="client-cell"><span className="client-avatar">{str.clienteIniciales}</span>{str.cliente}</div></td><td className="detail-cell">{str.detalleSTR}</td><td><StatusBadge status={str.estado} /></td><td className="date-cell">{str.fecha}</td><td><div className="row-actions"><button className="row-action details-action" onClick={() => setDetailSTR(str)}><Icon name="eye" size={14} /> Ver detalles</button><button className="row-action" onClick={() => openApproval(str)}>Aprobación <Icon name="arrow" size={14} /></button></div></td></tr>)}</tbody>
              </table>
            </div>
            <div className="table-footer"><span>Mostrando <strong>{filteredSTRs.length}</strong> de <strong>{visibleSTRs.length}</strong> solicitudes</span><div className="pagination"><button disabled aria-label="Página anterior">‹</button><button className="current-page">1</button><button disabled aria-label="Página siguiente">›</button></div></div>
          </section>
        </div>
      </main>
      {selectedSTR && <ApprovalModal str={selectedSTR} error={sendError} onClose={() => setSelectedSTR(null)} onSend={sendEmail} />}
      {detailSTR && <InvoiceDetailsModal str={detailSTR} onClose={() => setDetailSTR(null)} />}
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  )
}

export default App
