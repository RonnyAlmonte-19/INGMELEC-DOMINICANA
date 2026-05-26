# GridOps Enterprise v2 - ERP Operativo Industrial Full-Stack

GridOps Enterprise es una plataforma ERP empresarial premium, moderna y futurista para el control operativo de brigadas técnicas, personal de campo, inventario maestro (EPP, EPC, herramientas), actas digitales manuscritas, reposición de incidencias, auditoría y jerarquía operativa.

Esta versión **v2** actualiza la plataforma migrando de datos en memoria local a un backend real en **Node.js + Express** con una base de datos relacional empotrada **SQLite**.

---

## 🏗️ Estructura del Monorepo

La aplicación está organizada de forma modular:

```
novaops-enterprise/
├── package.json               # Configuración raíz de dependencias y scripts concurrentes
├── index.html                 # Punto de entrada HTML con tags SEO
├── tailwind.config.js         # Tokens de diseño y colores extendidos de GridOps
├── postcss.config.js          # Configuración de compilación Tailwind CSS v3
├── /src                       # Frontend React
│   ├── /components            # Componentes visuales responsivos
│   │   ├── /layout            # Sidebar (roles) y Topbar (telemetría y roles switcher)
│   │   └── /ui                # Modales interactivos, firmas canvas y diffs
│   ├── /context               # AppContext.jsx refactorizado para llamadas REST HTTP
│   ├── /pages                 # 12 páginas modulares operativas
│   ├── index.css              # Estilos base con gradientes premium y glows de neon
│   └── App.jsx                # Enrutador principal y cross-linking
└── /server                    # Backend API Express
    ├── index.js               # Entrada principal Express, Morgan, CORS, Puerto 5000
    ├── package.json           # Dependencias backend (express, cors, sqlite3, sqlite, morgan)
    ├── /database              # Archivos de persistencia SQL
    │   ├── gridops.db         # Archivo SQLite físico de base de datos
    │   └── initDb.js          # Inicializador de esquemas de tablas SQLite y semillas
    └── /routes                # Controladores y enrutamiento
        └── api.js             # Endpoints JSON y lógica de base de datos relacional
```

---

## ⚡ Requisitos Previos

- **Node.js** v18 o superior.
- **npm** v9 o superior.

---

## 🚀 Instrucciones de Inicio Rápido (Local)

### 1. Clonar e Instalar Dependencias
Instala los paquetes tanto en el directorio raíz (para React, Vite y Concurrently) como en el de backend (Express y SQLite):

```bash
# Instalar dependencias raíz (Frontend y utilidades monorepo)
npm install

# Instalar dependencias del servidor API
cd server
npm install
cd ..
```

### 2. Inicializar y Sembrar la Base de Datos SQLite
Genera las 13 tablas relacionales y siembra el roster inicial de técnicos dominicanos, herramientas y roles de prueba:

```bash
npm run db-init
```
*(Este comando creará el archivo `/server/database/gridops.db` listo para operar).*

### 3. Iniciar la Plataforma de Forma Concurrente
Lanza el cliente React (puerto 5173) y el servidor API Express (puerto 5000) en simultáneo con un solo comando:

```bash
npm run dev
```
Abre en tu navegador: [http://localhost:5173/](http://localhost:5173/) para explorar la consola operativa en vivo.

---

## 🔐 Directorio de Cuentas Demo

Usa cualquiera de las siguientes cuentas para evaluar la visibilidad por roles y el control jerárquico. La clave general para todas las cuentas es `1234`.

- **Developer**: `developer@gridops.com` / `1234`
- **Gerente**: `gerente@gridops.com` / `1234`
- **Coordinador**: `coordinador@gridops.com` / `1234`
- **Supervisor**: `supervisor@gridops.com` / `1234`

---

## 🛡️ Próximos Pasos para Subida a Producción

La arquitectura de GridOps Enterprise v2 ha quedado optimizada para facilitar su migración a entornos en la nube:

1. **Cifrado de Claves**: Integrar `bcryptjs` en `POST /api/auth/login` y `POST /api/usuarios` para guardar hashes seguros en vez de texto plano.
2. **Tokens JWT**: Generar JSON Web Tokens (`jsonwebtoken`) al iniciar sesión en el backend y validarlos mediante un middleware `auth.js` en las rutas protegidas.
3. **Escalar Base de Datos**: Migrar de SQLite a **PostgreSQL** o **MySQL** simplemente modificando el archivo `/server/database/initDb.js` para usar la librería `pg` o `mysql2`. Todas las consultas SQL implementadas son compatibles y portables.
4. **Almacenamiento de Firmas (S3)**: Guardar los buffers Base64 de firma digital en buckets de AWS S3 o Cloudinary, almacenando solo las URLs absolutas en la tabla `actas`.
