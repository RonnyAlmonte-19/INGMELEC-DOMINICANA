# INGMELEC | ALMACÉN GENERAL (v2.0.0)

Plataforma corporativa multi-almacén y multi-campamento para el control integral de inventario, activos maestros, movimientos transaccionales, levantamientos físicos y auditoría documental de **INGMELEC DOMINICANA**.

---

## Arquitectura del Sistema

- **Frontend:** React 19 + Vite + Tailwind CSS + Lucide Icons + Recharts.
- **Backend:** Node.js + Express (`/api/v2`) con cabeceras de seguridad HTTP (OWASP / HSTS) y autenticación criptográfica JWT (`HS256` + `PBKDF2-SHA512`).
- **Base de Datos:** MySQL Relacional (Clever Cloud en producción).

### Módulos Principales
1. **Dashboard General:** Indicadores globales y desglose de 13 métricas operativas por campamento confirmado (`ALMACÉN 27 DE FEBRERO`, `OPL`, `MANTENIMIENTO 633`) y activos pendientes de clasificación territorial.
2. **Inventario Maestro y Vistas Departamentales:** Informática y Telecomunicaciones, Oficinas y Mobiliario, Cocina y Comedor, y Almacén y Herramientas.
3. **Sedes, Campamentos y Almacenes:** Gestión territorial de sedes operativas y bodegas internas.
4. **Levantamientos y Auditorías en Campo:** Creación de sesiones de levantamiento, captura de bienes, importación desde plantillas Excel y consolidación.
5. **Movimientos de Stock (Kárdex):** Registro transaccional de entradas, salidas, traslados, asignaciones, devoluciones y ajustes.
6. **Centro de Reportes y Exportación:** Balances consolidados y exportación estructurada en formato CSV.
7. **Bitácora de Auditoría:** Trazabilidad inmutable de operaciones.
8. **Administración Exclusiva de Usuarios y Permisos:** Reservada exclusivamente al perfil de **Desarrollador Principal (`developer`)** con control granular por permiso (`permisos_json`) y por sede (`inv_usuario_campamentos`).

---

## Estructura del Repositorio

```text
INGMELEC-DOMINICANA/
├── package.json               # Scripts y dependencias para Render (frontend + backend)
├── index.html                 # Punto de entrada SPA
├── vite.config.js             # Configuración de compilación Vite
├── tailwind.config.js         # Diseño visual e identidad INGMELEC
├── postcss.config.js          # Procesamiento CSS
├── .env.example               # Plantilla de variables de entorno (sin secretos)
├── /src                       # Código fuente Frontend React
│   ├── /components            # Componentes reutilizables, modales y layout
│   ├── /context               # AppContext.jsx (estado de sesión y cliente API /api/v2)
│   ├── /pages                 # Vistas operativas y administrativas
│   └── /utils                 # Utilidades y normalización de estados
├── /server                    # Servidor Backend Express
│   ├── index.js               # Punto de entrada Express, /health, /api/v2 y estáticos dist/
│   ├── /config                # Validación estricta de JWT_SECRET (auth.js)
│   ├── /database              # Conexión MySQL (db.js), esquemas y migraciones SQL aditivas
│   └── /routes                # Router principal almacenApi.js
└── /docs                      # Manual de usuario y documentación de arquitectura/migración
```

---

## Variables de Entorno Requeridas

Configurar en `server/.env` (entorno local) o en el panel **Environment** de Render (producción), basándose en `.env.example`:

```env
PORT=5000
NODE_ENV=production
DB_HOST=tu-host-mysql.services.clever-cloud.com
DB_PORT=3306
DB_USER=tu-usuario-mysql
DB_PASSWORD=tu-contrasena-segura
DB_NAME=tu-base-de-datos
DB_SSL=false
JWT_SECRET=clave-criptografica-aleatoria-minimo-32-caracteres
```

---

## Comandos de Ejecución y Despliegue (Render)

- **Instalación y Compilación (Build Command):**
  ```bash
  npm install && npm run build
  ```
- **Arranque en Producción (Start Command):**
  ```bash
  npm start
  ```
- **Verificación de Salud (Health Check Path):**
  ```text
  /health
  ```
