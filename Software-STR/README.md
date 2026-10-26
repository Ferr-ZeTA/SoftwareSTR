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
