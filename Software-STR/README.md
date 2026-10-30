# STRflow

STRflow es una aplicación web para consultar solicitudes de traslado (STR),
filtrarlas por país, cliente, tipo y estado, y gestionar su aprobación. La API
externa es la fuente de los datos operativos del traslado; MongoDB conserva
solo las referencias necesarias y los estados, decisiones e historial locales.

## Contenido

- [Arquitectura](#arquitectura)
- [Tecnologías y recursos](#tecnologías-y-recursos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos y configuración local](#requisitos-y-configuración-local)
- [Comandos](#comandos)
- [Datos y sincronización con la API externa](#datos-y-sincronización-con-la-api-externa)
- [Estados de aprobación](#estados-de-aprobación)
- [Autenticación y permisos](#autenticación-y-permisos)
- [Aprobación por correo](#aprobación-por-correo)
- [API HTTP de STRflow](#api-http-de-strflow)
- [MongoDB y Compass](#mongodb-y-compass)
- [Despliegue en Render](#despliegue-en-render)
- [Diagnóstico](#diagnóstico)

## Arquitectura

```text
Navegador
  └── React + Vite
        └── API Express (/api)
              ├── MongoDB Atlas: usuarios y estado local de aprobación
              ├── API externa: consulta de traslados por país (GET)
              └── Brevo: correo de aprobación
                    └── Enlace público de aprobación → API Express → MongoDB
```

En producción, Express sirve tanto la API como los archivos compilados del
frontend. Así, la aplicación y los enlaces de aprobación usan el mismo dominio.
En desarrollo, Vite sirve el frontend y reenvía `/api` a
`http://localhost:8787`.

El servidor conecta con MongoDB al arrancar y aprovisiona las cuentas definidas
por variables de entorno. El navegador consulta el backend, que obtiene los
datos operativos de la API externa y los combina con el estado local de MongoDB.
La llave de la API nunca se expone al navegador.

## Tecnologías y recursos

| Componente | Tecnología / servicio | Uso |
|---|---|---|
| Interfaz | React 19, Vite 8, CSS | Panel de solicitudes, filtros, paginación, login y aprobaciones |
| Servidor | Node.js 22, Express 5 | API, autenticación, envío de correo y enlaces públicos |
| Persistencia | MongoDB con Mongoose 9 | Usuarios y estado local de solicitudes |
| Datos operativos | API externa de traslados | Lectura de datos por país usando `X-API-Key` |
| Correo | Brevo SMTP API | Envío de solicitudes de aprobación |
| Alojamiento | Render Web Service | Ejecuta el servidor y sirve el frontend compilado |
| Base alojada | MongoDB Atlas | Base persistente accesible desde Render y Compass |
| Pruebas | Vitest, Testing Library, MongoDB Memory Server | Pruebas del frontend, API y persistencia |
| Lint | Oxlint | Revisión estática |

## Estructura del proyecto

```text
Software-STR/
├── src/
│   ├── App.jsx                     # Vistas, filtros, acciones y modales
│   ├── App.css                     # Estilos del panel
│   ├── hooks/useSTRs.js            # Carga, refresco y sondeo de cambios
│   └── services/strService.js      # Cliente HTTP del frontend y adaptación de datos
├── server/
│   ├── index.js                    # Arranque, limpieza de campos antiguos y aprovisionamiento
│   ├── app.js                      # Middleware, rutas, salud y frontend de producción
│   ├── db.js                       # Conexión a MongoDB
│   ├── middleware/auth.js          # JWT, roles y alcance por país
│   ├── models/
│   │   ├── Request.js              # Referencia externa y estado/historial local
│   │   └── User.js                 # Cuenta, rol, país y hash de contraseña
│   ├── routes/
│   │   ├── auth.js                 # Inicio de sesión y usuario autenticado
│   │   ├── requests.js             # Solicitudes, sync y aprobación por enlace
│   │   └── users.js                # Administración de usuarios
│   └── services/
│       ├── syncExternalApi.js      # Consulta y normalización de datos actuales de la API
│       ├── approvalService.js      # Tokens de aprobación de un solo uso
│       ├── provisionUsers.js       # Cuentas definidas por variables de entorno
│       ├── mailer.js               # Plantilla y envío por Brevo
│       └── sapApproval.js          # Punto de integración SAP, desactivado por defecto
├── scripts/
│   ├── dev.js                      # Arranque de API y Vite en paralelo
│   ├── seedUsers.js                # Aprovisiona las cuentas de entorno
│   ├── migrate.js                  # Sincronización inicial y purga según fecha
│   ├── audit.js                    # Compara MongoDB con la API externa
│   ├── verify.js                   # Verificación de integración
│   ├── verifyApi.js                # Pruebas de API
│   └── validate.js                 # Validación amplia de la aplicación
├── start.bat / stop.bat            # Arranque y apagado local en Windows
├── .env.example                    # Plantilla sin credenciales privadas
└── ../render.yaml                  # Blueprint del servicio de Render
```

## Requisitos y configuración local

- Node.js 22 o superior.
- npm.
- MongoDB local o un clúster de MongoDB Atlas.
- Acceso a la API externa para sincronizar traslados.
- Credenciales de Brevo para enviar correos (si se probará ese flujo).

### Instalación

Desde la carpeta del proyecto:

```powershell
cd C:\SoftwareSTR\Software-STR
npm ci
Copy-Item .env.example .env
```

Completa `.env` con tus valores locales. **No subas `.env` a GitHub ni pegues
su contenido en chats o capturas.** El archivo `.env.example` no debe contener
secretos reales.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---:|---|
| `PORT` | No | Puerto HTTP; predeterminado `8787`. Render lo proporciona. |
| `MONGODB_URI` | Sí | URI del Mongo local o Atlas. |
| `MONGODB_DB` | No | Base de datos; predeterminada `strflow`. |
| `JWT_SECRET` | Sí para login | Secreto de firma JWT; usar valor aleatorio y privado. |
| `JWT_EXPIRES_IN` | No | Duración del JWT; predeterminada `8h`. |
| `AUTH_GLOBAL_EMAIL` | No | Correo para la cuenta general; predeterminado `gerentegeneral@red.com`. |
| `AUTH_GLOBAL_PASSWORD` | Para provisionar gerente general | Contraseña inicial/administrada de esa cuenta. |
| `AUTH_GUATEMALA_PASSWORD` | Para provisionar Guatemala | Contraseña inicial/administrada de esa cuenta. |
| `AUTH_ELSALVADOR_PASSWORD` | Para provisionar El Salvador | Contraseña inicial/administrada de esa cuenta. |
| `EXTERNAL_API_URL` | No | Endpoint de lectura de STR; tiene un valor predeterminado en el servicio. |
| `EXTERNAL_API_KEY` | Sí para consultar solicitudes | Llave enviada por el backend en `X-API-Key`; nunca se expone al navegador. |
| `SYNC_MIN_DATE` | No | Fecha mínima consultada; predeterminada `2026-10-01T00:00:00Z`. |
| `BREVO_API_KEY` | Sí para enviar correo | Llave privada de Brevo. |
| `BREVO_EDUARDO_EMAIL` | Sí para enviar correo | Destinatario de las solicitudes de aprobación. |
| `BREVO_SENDER_EMAIL` | Sí para enviar correo | Remitente verificado en Brevo. |
| `BREVO_SENDER_NAME` | No | Nombre del remitente; predeterminado `STRflow`. |
| `APPROVAL_PUBLIC_URL` | No | URL pública base para enlaces. En Render se usa `RENDER_EXTERNAL_URL` si se omite. |
| `APPROVAL_TOKEN_TTL_HOURS` | No | Vigencia del enlace; predeterminada 72 horas. |
| `REVERT_WINDOW_SECONDS` | No | Cuenta regresiva antes de mostrar confirmación; predeterminada 10 segundos. |
| `CORS_ORIGIN` | No | Origen permitido por CORS; predeterminado `*`. |
| `SAP_APPROVAL_URL` | No | Endpoint de escritura SAP, aún pendiente de contrato. |
| `SAP_APPROVAL_ENABLED` | No | Mantener `false` hasta completar endpoint y autenticación SAP. |

Las cuentas configuradas se aprovisionan al arrancar el servidor. Si una
contraseña está vacía, esa cuenta se omite y se escribe una advertencia en los
logs. Si existe un valor, se crea o actualiza la cuenta en MongoDB y se guarda
un hash bcrypt, nunca la contraseña en texto plano. En consecuencia, esos
valores de entorno restablecen la contraseña de las cuentas aprovisionadas en
cada arranque; mantenlos actualizados en Render.

### Arranque local en Windows

La opción recomendada es:

```text
start.bat
```

El script detecta o inicia MongoDB local, levanta la API en `8787`, inicia Vite
en `5173` y abre el navegador. Para apagarlo usa `stop.bat`. Si ya tienes
MongoDB instalado como servicio de Windows, `start.bat` lo reutiliza. El script
`scripts\install-mongodb-service.ps1` permite instalar el servicio local y
apuntarlo a `.mongodb-data`; requiere PowerShell como administrador.

También se puede iniciar API y frontend desde la terminal con `npm run dev`,
pero ese comando no inicia MongoDB. La API requiere que MongoDB ya esté
disponible.

## Comandos

| Comando | Función |
|---|---|
| `npm start` | Ejecuta `start.bat` (Windows): MongoDB local, API y frontend. |
| `npm stop` | Ejecuta `stop.bat`. |
| `npm run dev` | Inicia API y Vite en paralelo; MongoDB debe estar iniciado. |
| `npm run dev:web` | Inicia solamente Vite. |
| `npm run api` | Inicia solamente Express. |
| `npm run build` | Compila React/Vite en `dist/`. |
| `npm run preview` | Previsualiza el build de Vite. |
| `npm test` | Ejecuta las pruebas una vez. |
| `npm run test:watch` | Ejecuta Vitest en modo observación. |
| `npm run lint` | Ejecuta Oxlint. |
| `npm run seed` | Crea/actualiza las cuentas desde variables de entorno. |
| `npm run migrate` | Consulta la API y reporta el estado local; no copia ni elimina traslados. |
| `npm run setup` | Ejecuta `seed` y luego el reporte no destructivo de `migrate`. |
| `npm run audit` | Compara las solicitudes actuales de API con referencias de estado local. |
| `npm run verify` | Prueba lectura de API, token y persistencia local en MongoDB en memoria. |
| `npm run verify:api` | Ejecuta verificaciones HTTP contra la API externa y MongoDB en memoria. |
| `npm run validate` | Comprueba disponibilidad y consistencia del modelo actual. |

## Datos y sincronización con la API externa

### Qué datos vienen de cada lugar

La API externa se consulta en modo **solo lectura**. STRflow no cambia en esa
API los estados de aprobación. MongoDB conserva la referencia `externalId` y
el país para enlazar cada solicitud con el estado local de STRflow: estado,
justificación, autor, fecha, tokens, posposición e historial.

Los datos operativos (documento, cliente, bodegas, artículos, cantidades y
fechas) se consultan desde la API por medio del backend. La respuesta se
mantiene en caché del servidor por un máximo de 15 segundos para reducir
solicitudes repetidas; los datos operativos no se guardan en MongoDB y la llave
de la API nunca se expone al navegador.

### Consulta y transformación

El servicio consulta `EXTERNAL_API_URL` una vez por país:

```http
GET {EXTERNAL_API_URL}?var_pais=GT
X-API-Key: {EXTERNAL_API_KEY}
Accept: application/json
```

También consulta `var_pais=SV`. La respuesta puede ser un arreglo JSON o
contenerlo en `data`, `value` o `result`. El servicio agrupa las filas —una por
artículo/modelo— por país y número de documento. El identificador resultante es
`{PAIS}-{documento}`, por ejemplo `GT-12345`. Las líneas se devuelven como
`items`, con modelo, descripción y cantidad; también se calculan el número de
líneas y la cantidad total. Este resultado solo vive en la respuesta del
backend y no se almacena en MongoDB.

Se interpretan fechas de API en formato día/mes/año con hora opcional y se
filtran con `SYNC_MIN_DATE`. El listado del dashboard aplica también esa fecha
mínima. Si la API falla, el backend devuelve un error y no sustituye los datos
por una copia antigua de MongoDB. Una respuesta `404` con cuerpo vacío se trata
como país sin datos.

### Cómo se conserva el estado local

- **Consulta del listado:** los datos se agrupan directamente desde la API y
  se combinan con el estado local. Una solicitud sin estado guardado se muestra
  como `Pendiente`, sin crear una copia en MongoDB.
- **Acción local:** al enviar, posponer, decidir u ocultar una solicitud, se
  guarda en MongoDB su referencia y únicamente el estado necesario.
- **Solicitud ausente de la API:** el estado local se conserva, pero no se
  inventan datos operativos para mostrarla como actual.
- **La API está caída o responde un error:** el backend informa el fallo; no
  presenta datos antiguos como si fueran actuales.
- **Actualización manual de estado desde el panel:** se guarda en MongoDB y se
  agrega una entrada al historial.
- **Decisión por correo:** al confirmar el enlace, el estado y la justificación
  se escriben en MongoDB. Las consultas futuras de API agregan el estado local.

El botón **Actualizar** fuerza una consulta actual a la API. Las lecturas
normales del panel usan la caché breve del backend.

## Estados de aprobación

| Estado | Significado |
|---|---|
| `Pendiente` | Todavía no hay decisión local confirmada. Es el estado inicial de cada traslado nuevo. |
| `Aprobada` | La decisión quedó confirmada en STRflow. |
| `No Aprobada` | La solicitud fue rechazada en STRflow. |

Enviar un correo **no** cambia el estado: solo genera y envía un enlace de
decisión. El cambio ocurre al confirmar ese enlace (o al cambiar el estado
desde una operación autenticada del panel). La decisión y el historial viven
en MongoDB, ya que el endpoint externo de consulta no recibe escrituras.

## Autenticación y permisos

El login compara la contraseña con un hash bcrypt en MongoDB y entrega un JWT.
El frontend guarda el token en `localStorage` y lo envía como
`Authorization: Bearer <token>` en rutas protegidas. Una sesión expirada se
cierra y solicita iniciar sesión otra vez.

| Rol | Acceso |
|---|---|
| `GERENTE_GENERAL` | Ve ambos países, filtra por país, administra usuarios y puede actualizar desde la API. |
| `GERENTE_REGIONAL` | El servidor limita sus consultas y cambios al país asignado (`GT` o `SV`). |

El filtro visual del país no es una barrera de seguridad: el backend aplica el
alcance regional a las consultas y mutaciones, incluso si un cliente intenta
enviar otro país.

## Aprobación por correo

1. Un usuario autenticado solicita enviar una STR a aprobación.
2. El servidor consulta la STR actual en la API y guarda su referencia junto
   con el hash y la expiración de un token aleatorio de un solo uso.
3. Brevo envía un correo con el detalle, información adicional y enlaces para
   aprobar o rechazar.
4. El enlace abre una página de confirmación con una breve cuenta regresiva y
   solicita la justificación: opcional al aprobar y obligatoria al rechazar.
5. Al confirmar, el servidor valida y consume el token de forma atómica; guarda
   estado, fecha, destinatario y justificación en MongoDB.
6. El frontend consulta periódicamente las solicitudes para detectar cambios
   hechos por correo y mostrar una notificación.

El gerente general abre directamente la bandeja **Aprobaciones** al iniciar
sesión. Allí ve los datos del traslado y sus artículos, puede aprobar o
rechazar (con justificación obligatoria al rechazar), o guardarlo para después.
Las solicitudes pospuestas permanecen dentro de **Aprobaciones**, en la sección
**Para revisar más tarde**. Incluye solicitudes de Guatemala y El Salvador,
aunque las haya pospuesto otro usuario con rol de gerente general; cualquier
gerente general puede devolverlas a pendientes. La decisión tomada desde el
correo o el dashboard se guarda en el mismo registro; al decidir en el panel,
el enlace pendiente del correo queda invalidado.

Los enlaces caducan según `APPROVAL_TOKEN_TTL_HOURS` y solo pueden usarse una
vez. `APPROVAL_PUBLIC_URL` debe omitirse en Render para que se use
`RENDER_EXTERNAL_URL`; no configures una URL `localhost` en producción.

### Integración con SAP

El GET de traslados es de solo lectura. La escritura de aprobaciones a SAP está
desactivada por defecto con `SAP_APPROVAL_ENABLED=false`. Hasta que exista un
contrato confirmado para endpoint, payload y autenticación de servidor, la
decisión se guarda en MongoDB y la constancia de SAP aparece como simulada. El
formulario público nunca solicita usuario ni contraseña SAP.

## API HTTP de STRflow

Salvo login, salud y enlaces de aprobación por correo, las rutas requieren JWT.
Las rutas de solicitudes también aplican el alcance por país.

### Salud y autenticación

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/health` | Público | Comprueba que Express responde (`{"ok":true}`). |
| `POST /api/auth/login` | Público | Recibe `{ "email", "password" }`; devuelve JWT y usuario. |
| `GET /api/auth/me` | JWT | Devuelve la identidad incluida en el JWT. |

### Solicitudes

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/requests` | JWT | Lista con paginación y filtros. |
| `GET /api/requests/:externalId` | JWT | Obtiene una solicitud dentro del alcance del usuario. |
| `PATCH /api/requests/:externalId` | JWT | Cambia estado local y/o notas internas. |
| `POST /api/requests/sync` | JWT + gerente general | Fuerza lectura de países (opcionalmente `{"countries":["GT"]}`); no persiste el payload. |
| `POST /api/requests/:externalId/send-approval` | JWT | Envía el correo de aprobación. |
| `POST /api/requests/:externalId/decide-approval` | JWT + gerente general | Aprueba o rechaza una solicitud enviada; invalida el enlace del correo. |
| `POST /api/requests/:externalId/defer-approval` | JWT + gerente general | Guarda la solicitud para revisarla después. |
| `POST /api/requests/:externalId/restore-approval` | JWT + gerente general | Devuelve la solicitud pospuesta a la bandeja. |
| `DELETE /api/requests/:externalId` | JWT | Oculta localmente; no elimina de la API externa. |
| `POST /api/requests/:externalId/restore` | JWT | Restaura una solicitud ocultada. |

Parámetros de consulta de listado: `page`, `limit` (máximo 200), `status`,
`country`, `tipo`, `search`, `from` y `to`.

### Aprobación pública

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/requests/approve?token=...&status=...` | Token de correo | Muestra la confirmación. |
| `POST /api/requests/approve/confirm` | Token de correo | Confirma estado y justificación. |
| `GET /api/requests/approve/cancel` | Público | Muestra que se canceló sin registrar una decisión. |

### Usuarios

Todas estas rutas requieren JWT y rol `GERENTE_GENERAL`.

| Método y ruta | Función |
|---|---|
| `GET /api/users` | Lista cuentas sin hashes de contraseñas. |
| `POST /api/users` | Crea una cuenta; requiere nombre, correo, contraseña y rol. |
| `PATCH /api/users/:id` | Cambia nombre, actividad o contraseña. |
| `DELETE /api/users/:id` | Elimina una cuenta; no permite eliminar la propia sesión. |

## MongoDB y Compass

La base se llama `strflow` por defecto. Colecciones principales:

### `requests`

Un documento solo cuando existe estado local, identificado con `externalId`
(`GT-...` o `SV-...`). Contiene:

- Referencia a la API: `externalId` y país.
- Estado local: `localStatus`, notas e indicador de oculto.
- Auditoría: fecha, autor, canal e historial de decisiones.
- Aprobación: destinatario y hash/fechas del token. El token plano no se guarda.
- Integración SAP: estado y respuesta informativa; no incluye contraseñas.

Al arrancar, el servidor elimina de documentos antiguos los campos operativos
de la API, preservando estados, historial, tokens y referencias.

### `users`

Correo único, nombre, rol, país, estado activo, fecha de último login y
`passwordHash` bcrypt. La selección normal del modelo excluye el hash.

### Compass y Atlas

Para inspeccionar la base alojada, conecta Compass al mismo clúster de Atlas
que está configurado en `MONGODB_URI` de Render. Usa el usuario de **Database
Access** de Atlas, no la cuenta web de Atlas ni una cuenta de STRflow. En Atlas,
permite la IP de tu computadora en **Network Access**; Render necesita también
tener acceso al clúster. La base aparece como `strflow` y las colecciones
principales como `requests` y `users`.

No compartas la URI, usuario/contraseña de Atlas ni capturas que los muestren.
La URI local `mongodb://127.0.0.1:27017` apunta a la computadora y no a Atlas.

## Despliegue en Render

`render.yaml` define un servicio Node llamado `strflow`, con raíz
`Software-STR`, comando de build `npm ci && npm run build` y arranque
`node server/index.js`.

### Configuración inicial

1. Sube el repositorio a GitHub.
2. En Render, crea un **Blueprint** y selecciona el repositorio que contiene
   `render.yaml`.
3. Crea un clúster en MongoDB Atlas. Crea un Database User y autoriza la
   conexión de red del servicio.
4. En Render → servicio → **Environment**, configura los secretos:
   `MONGODB_URI`, `EXTERNAL_API_KEY`, `BREVO_API_KEY`,
   `BREVO_EDUARDO_EMAIL`, `BREVO_SENDER_EMAIL` y las contraseñas
   `AUTH_GLOBAL_PASSWORD`, `AUTH_GUATEMALA_PASSWORD`,
   `AUTH_ELSALVADOR_PASSWORD`.
5. Revisa también `MONGODB_DB=strflow`, `JWT_SECRET` (generada por Blueprint)
   y `SYNC_MIN_DATE`.
6. Guarda los cambios y espera a que el deploy aparezca como **Live**.
7. Revisa los logs: debe indicar conexión a MongoDB y cuentas aprovisionadas.
   No es necesario ejecutar `npm run setup` en
   Shell para crear las cuentas: el servidor las aprovisiona al arrancar.
8. Inicia sesión con los correos configurados y sus contraseñas de Render.

Si actualizas el usuario o contraseña de base de datos de Atlas, actualiza
también `MONGODB_URI` en Render. El `.env` local no se copia automáticamente a
Render.

En el plan gratuito de Render, el servicio puede suspenderse tras un período sin
tráfico. Al despertar, las solicitudes vuelven a consultarse desde la API
externa; no se necesita una sincronización en segundo plano.

## Diagnóstico

| Síntoma | Qué revisar |
|---|---|
| Login devuelve `401` | Que el correo y la variable `AUTH_*_PASSWORD` correspondan, que Render esté en **Live** y que sus logs indiquen `[users] cuenta lista: ...`. Verifica que `MONGODB_URI` apunta a la base correcta. |
| `[users] omitido ...` en logs | Falta la variable de contraseña para esa cuenta o está vacía en Render. |
| No aparecen solicitudes | Revisa `EXTERNAL_API_KEY`, `EXTERNAL_API_URL`, `SYNC_MIN_DATE` y errores de API en logs. Ejecuta `npm run audit` para comparar API y referencias de estado. |
| Correo no sale | Revisa el log de arranque `[mailer] Variables requeridas`: solo indica `presente` o `FALTA`, nunca muestra valores secretos. Si faltan variables, agrégalas en **Environment del servicio correcto de Render** y vuelve a desplegar; si aparecen presentes, revisa el detalle HTTP que devuelve Brevo y que el remitente esté verificado. |
| Enlace de correo usa localhost | Quita `APPROVAL_PUBLIC_URL` de Render o pon la URL pública correcta; normalmente se recomienda omitirla y usar `RENDER_EXTERNAL_URL`. |
| Compass muestra `ECONNREFUSED 127.0.0.1:27017` | Compass está conectado al Mongo local. Crea/usa una conexión a Atlas con la URI del clúster. |
| Compass muestra `bad auth` | Revisa el usuario/contraseña de **Database Access**, reemplaza credenciales guardadas en Compass y codifica caracteres especiales de la contraseña en la URI. |
| Compass conecta pero no se ven datos de Render | Comprueba que Compass y Render usen el mismo clúster en Atlas y que la base se llame `strflow`. |
| Una STR desapareció de la API | MongoDB conserva solo su estado local; los datos operativos dejan de mostrarse como actuales. |

En reportes de errores, comparte mensajes y logs redactados. Nunca incluyas
contraseñas, `MONGODB_URI`, JWT, API keys ni el contenido de `.env`.
