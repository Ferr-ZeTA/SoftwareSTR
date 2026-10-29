# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Arranque

### Un clic

Doble clic en `start.bat` (o `npm start`). Levanta MongoDB, la API y el
frontend en orden, espera a que cada uno responda y abre el navegador.
Para apagar: `stop.bat` (o `npm stop`). Los datos no se tocan.

### MongoDB como servicio de Windows (recomendado)

Para que MongoDB arranque solo con la computadora, en una PowerShell
**como administrador**:

```
cd C:\SoftwareSTR\Software-STR
powershell -ExecutionPolicy Bypass -File scripts\install-mongodb-service.ps1
```

Instala MongoDB Community Server y lo apunta a la carpeta `.mongodb-data`
que ya existe, así que no se pierde ningún dato ni ninguna aprobación.
Despues de eso, `start.bat` detecta el servicio y lo usa.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` / `npm stop` | Levanta o apaga todo |
| `npm run audit` | Verifica que la base coincida con la API y lista las aprobaciones |
| `npm run migrate` | Repuebla desde la API |
| `npm run seed` | Crea los usuarios |
| `npm test` | Tests del frontend |
| `npm run verify` | Prueba la sincronización contra la API real |

### Modo demo

La aplicación inicia en modo demo (`DEMO_MODE=true`), sin autenticación ni
llamadas al API externo. Muestra cinco solicitudes de ejemplo. La gestión de
usuarios también es de demostración: sus cambios se guardan solo en ese
navegador y no crean cuentas reales.

Para administrar usuarios reales, configurar las credenciales y MongoDB, correr
`npm run setup` y establecer `DEMO_MODE=false` en `.env`. El acceso a `/api/users`
requiere autenticación y el rol de gerente general; los gerentes regionales no
pueden listar ni modificar usuarios.

## Despliegue en Render

Un solo servicio web sirve la API y el frontend compilado, así los enlaces
del correo son absolutos y abren desde cualquier computadora.

**Base de datos:** Render no ofrece MongoDB. Crea un cluster gratuito en
MongoDB Atlas (https://www.mongodb.com/atlas), y en Network Access permite
`0.0.0.0/0` para que Render pueda conectarse.

**Pasos**

1. Sube el repo a GitHub.
2. En Render: New -> Blueprint, y apunta al repo. `render.yaml` define todo.
3. Llena las variables marcadas como secretas: `MONGODB_URI`,
   `EXTERNAL_API_KEY`, `BREVO_API_KEY`, `BREVO_EDUARDO_EMAIL`,
   `BREVO_SENDER_EMAIL` y las tres `AUTH_*_PASSWORD`.
4. Tras el primer deploy, en la pestaña Shell del servicio: `npm run setup`
   (crea los usuarios y puebla desde la API).

No configures `APPROVAL_PUBLIC_URL`: si falta, el servidor usa
`RENDER_EXTERNAL_URL`, que Render inyecta con la URL pública real.

En el plan gratuito el servicio se duerme tras 15 minutos sin tráfico, así
que la sincronización cada 30 minutos solo corre mientras esté despierto.
Al entrar a la página se despierta y sincroniza al arrancar.

Para mantener la aplicación disponible y sincronizando continuamente, cambia
el servicio de Render a un plan de pago que no entre en suspensión. MongoDB
Atlas es un servicio separado: sus datos permanecen allí aunque Render se
reinicie o se duerma. Esta app usa un servidor Express persistente y una tarea
`setInterval`, por lo que Vercel no es adecuado para desplegarla tal cual; en
Vercel habría que mover la API y la sincronización periódica a otro servicio.
