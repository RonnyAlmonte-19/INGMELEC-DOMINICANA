# GridOps Enterprise v2 - ERP Operativo Industrial Full-Stack

GridOps Enterprise es una plataforma ERP empresarial para el control operativo de brigadas tecnicas, personal de campo, inventario maestro (EPP, EPC, herramientas), actas digitales, reposicion de incidencias, auditoria y jerarquia operativa.

Esta version usa un frontend **React + Vite**, un backend **Node.js + Express** y una base de datos relacional **MySQL remota**. En produccion, MySQL debe apuntar a Clever Cloud mediante variables de entorno.

---

## Estructura del Monorepo

```text
novaops-enterprise/
├── package.json               # Scripts raiz para frontend, backend y build
├── index.html                 # Punto de entrada HTML
├── tailwind.config.js         # Tokens de diseno
├── postcss.config.js          # Compilacion Tailwind CSS
├── /src                       # Frontend React
│   ├── /components            # Componentes visuales
│   ├── /context               # AppContext.jsx con llamadas REST HTTP
│   ├── /pages                 # Paginas operativas
│   └── App.jsx                # Enrutador principal
└── /server                    # Backend API Express
    ├── index.js               # Entrada principal Express
    ├── package.json           # Dependencias backend
    ├── /database
    │   ├── db.js              # Conexion/pool MySQL
    │   └── initDb.js          # Inicializador de esquemas y semillas MySQL
    └── /routes
        └── api.js             # Endpoints JSON y logica relacional
```

---

## Requisitos Previos

- Node.js v18 o superior.
- npm v9 o superior.
- Base de datos MySQL disponible, por ejemplo Clever Cloud.

---

## Variables de Entorno del Backend

Configura estas variables en `server/.env` para desarrollo local y en Render para produccion:

```env
DB_HOST=tu-host-mysql
DB_PORT=3306
DB_USER=tu-usuario
DB_PASSWORD=tu-password
DB_NAME=tu-base
DB_SSL=false
JWT_SECRET=tu-secreto
PORT=5000
```

---

## Inicio Rapido Local

```bash
npm install
cd server
npm install
cd ..
npm run dev
```

Abre [http://localhost:5173/](http://localhost:5173/) para explorar la consola operativa.

---

## Inicializar MySQL

Usa este comando solo cuando quieras crear o resembrar las tablas MySQL configuradas en `server/.env`:

```bash
npm run db-init
```

Importante: no ejecutes `db-init` contra la base de produccion si ya contiene datos reales, porque puede recrear o resembrar estructuras.

---

## Cuentas Demo

La clave general para las cuentas sembradas es `1234`.

- Developer: `developer@gridops.com` / `1234`
- Gerente: `gerente@gridops.com` / `1234`
- Coordinador: `coordinador@gridops.com` / `1234`
- Supervisor: `supervisor@gridops.com` / `1234`

---

## Produccion

- GitHub guarda el codigo.
- Render ejecuta la aplicacion y debe tener las variables `DB_*` configuradas.
- Clever Cloud aloja MySQL como fuente unica de datos.
