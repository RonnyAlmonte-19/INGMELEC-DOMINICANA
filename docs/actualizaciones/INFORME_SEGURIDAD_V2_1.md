# INFORME DE SEGURIDAD — INGMELEC | ALMACÉN GENERAL v2.1

**Rama:** `develop/almacen-v2.1`  
**Evaluación:** Equipo A (Seguridad y Control de Usuarios) + Auditoría Independiente (Equipo D)

---

## 1. Controles Verificados y Evidencia

| Control | Implementación Verificada | Resultado de Pruebas |
| :--- | :--- | :---: |
| **Hashing de Contraseñas** | Argon2id (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`) con migración transparente desde `scrypt` legado | **PASS** (`etapa02`, `etapa08`) |
| **Emisión y Firma JWT** | `HS256` con `crypto.timingSafeEqual`, TTL `12h`, validación estricta de `alg`, `typ`, `exp`, `id` y `JWT_SECRET` obligatorio en producción | **PASS** (`etapa02`, `etapa08`) |
| **Revocación Inmediata (`token_version`)** | `POST /api/v2/auth/logout` y cambios de usuario/permisos/estado incrementan `inv_usuarios.token_version`, invalidando JWT activos al instante | **PASS** (`etapa02`, `etapa05`, `etapa08`) |
| **`requireAuth` Fail-Closed** | Ante caída o indisponibilidad de BD responde `HTTP 503` denegando cualquier acceso | **PASS** (`etapa02`) |
| **Anti-Escalamiento de Privilegios** | `POST/PUT /usuarios` rechazan con `HTTP 403` crear o promover a `developer`, asignar `es_developer: 1` o asignar comodín `'*'` | **PASS** (`etapa05`, `etapa08`) |
| **Aislamiento Territorial (IDOR)** | `getUserAllowedCampamentos` restringe lecturas y mutaciones a las sedes asignadas (`HTTP 403` ante cruce entre `OPL`, `M633` y `27FEB`) | **PASS** (`etapa02`, `etapa04`, `etapa08`) |
| **Seguridad BD y TLS** | `clever-cloud-mysql-ca.pem` con `rejectUnauthorized: true`, `multipleStatements: false`, consultas parametrizadas y `guard.js` | **PASS** (`etapa01`, `etapa02`, `etapa08`) |
| **Transporte, CORS, Rate Limit y Exportación** | Lista blanca `ALLOWED_ORIGINS`, headers CSP/Permissions-Policy, rate limit por `IP` + `IP+email` con poda, neutralización `CWE-1236` y `0` vulnerabilidades en `npm audit --omit=dev` | **PASS** (`etapa02`, `etapa07`, `npm audit`) |

---

## 2. Riesgos Residuales Aceptados / Documentados
1. **Token en `localStorage`:** Propio de la arquitectura SPA; mitigado mediante `0` vulnerabilidades en dependencias (`npm audit = 0`), encabezados CSP y revocación inmediata vía `token_version`.
2. **Rate limiter en memoria:** Adecuado para despliegue en instancia única (Render); si se escalara a múltiples réplicas horizontales, requeriría almacenamiento compartido.
