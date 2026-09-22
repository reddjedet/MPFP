# Plan de correcciones y mejoras — MPFP

> Inventario vivo de bugs, riesgos, deuda técnica, contradicciones y oportunidades de mejora. No implica que todos los puntos estén confirmados en producción: cada hallazgo debe reproducirse y cerrarse con una prueba o evidencia.

**Estado inicial:** auditoría estática del repositorio (sin modificar la aplicación).

## Convenciones

- **P0 — crítico:** seguridad, pérdida/corrupción de datos o indisponibilidad.
- **P1 — alto:** bug funcional, contrato roto o deuda que dificulta el mantenimiento.
- **P2 — medio:** calidad, UX, rendimiento o documentación.
- **P3 — bajo:** limpieza y mejoras futuras.
- Estados: `pendiente`, `en progreso`, `resuelto`, `descartado`.

---

## 1. Resumen priorizado

| ID | Área | Prioridad | Estado | Hallazgo |
|---|---|---:|---|---|
| SEC-01 | Seguridad | P0 | pendiente | La API no tiene autenticación/autorización; además se persisten datos de cartera que podrían ser sensibles. |
| SEC-02 | Seguridad | P0 | pendiente | CORS permite cualquier subdominio `*.onrender.com` con credenciales. |
| DEP-01 | Despliegue | P1 | pendiente | Render expone en `0.0.0.0`, contradiciendo la documentación y los tests de binding local. |
| SEC-03 | Seguridad | P1 | pendiente | CSP contiene `unsafe-eval` y `unsafe-inline`, debilitando la protección XSS. |
| DATA-01 | Backend | P1 | pendiente | La persistencia atómica tiene protección entre hilos, pero no un lock entre procesos. |
| DATA-02 | Backend | P1 | pendiente | Un JSON corrupto se reemplaza automáticamente por datos por defecto, con riesgo de pérdida silenciosa. |
| API-01 | Backend | P1 | pendiente | Muchos routers/servicios capturan `Exception` genérica y pueden ocultar bugs o devolver respuestas ambiguas. |
| QA-01 | Calidad | P1 | pendiente | No hay lint, tests frontend, cobertura ni validación automática de contratos OpenAPI/TypeScript. |
| DOC-01 | Documentación | P1 | pendiente | README afirma “10 archivos JSON”, pero el repositorio contiene más archivos de datos y los ejemplos no están descritos completamente. |
| CACHE-01 | Rendimiento | P1 | pendiente | La caché de disco mezcla escrituras concurrentes y serializa todo el contenido por función; puede perder actualizaciones y crecer sin límite. |
| OPS-01 | Operaciones | P1 | pendiente | `start.sh`/PID/logs y despliegue no tienen una estrategia única de proceso, health checks y apagado robusto. |

---

## 2. Seguridad y privacidad

### SEC-01 — Ausencia de autenticación y autorización (P0, pendiente)
- Revisar todos los endpoints `POST/PUT/DELETE`, especialmente portfolios, holdings, valuación y sincronización de fair values.
- Actualmente no se observa una identidad de usuario, sesión, API key, permisos por recurso ni rate limiting.
- Si la app deja de ser estrictamente local, cualquier cliente que alcance el puerto puede leer o modificar datos.
- **Acción:** definir modelo de usuarios/sesiones o declarar explícitamente “solo local”; añadir autenticación, autorización por cartera, CSRF si corresponde, auditoría y tests negativos.

### SEC-02 — CORS demasiado amplio con credenciales (P0, pendiente)
- `main.py` acepta `allow_origin_regex=r"...|.*\.onrender\.com..."` junto con `allow_credentials=True`.
- Un subdominio no confiable o tomado por un tercero podría operar como origen autorizado.
- **Acción:** lista explícita por entorno (`DEV_ALLOWED_ORIGINS`, `PROD_ALLOWED_ORIGINS`), nunca regex amplia en producción; no usar credenciales si no son necesarias.

### SEC-03 — CSP debilitada (P1, pendiente)
- `main.py` usa `script-src 'unsafe-eval'` y `style-src 'unsafe-inline'`; `X-XSS-Protection` es obsoleta y no sustituye una CSP estricta.
- **Acción:** eliminar `unsafe-eval`, reducir inline styles o usar hashes/nonces, agregar `base-uri 'self'`, `form-action 'self'`, `object-src 'none'` y probar la política con el build real.

### SEC-04 — Falta de límites de entrada y abuso (P1, pendiente)
- Auditar tamaños máximos de payload, número de activos, límites de cálculo Markowitz, nombres de archivos, timeouts, paginación y frecuencia de requests.
- Añadir rate limiting, timeouts de cliente HTTP, circuit breaker y respuestas controladas ante proveedores externos.

### SEC-05 — Datos privados y trazabilidad (P1, pendiente)
- `.gitignore` excluye `user_holdings.json`, `ppc_values.json`, etc., pero no existe una separación formal entre datos demo, datos locales y datos de producción.
- **Acción:** documentar clasificación de datos, permisos de directorio, cifrado/secret manager para despliegues y procedimiento de backup/restauración/borrado.
- Verificar que logs y excepciones nunca incluyan holdings, tokens o payloads completos.

### SEC-06 — Auditoría de seguridad incompleta (P2, pendiente)
- `scripts/audit_security_privacy.py` depende de patrones heurísticos y puede producir falsos positivos/negativos; no reemplaza secret scanning, SAST, dependency scanning ni DAST.
- **Acción:** integrar `pip-audit`/Dependabot, `npm audit` con política de severidad, Semgrep/Bandit y secret scanning en CI.

---

## 3. Despliegue y configuración

### DEP-01 — Contradicción de binding (P1, pendiente)
- README y `docs/core_rules.md` dicen que el servicio solo escucha en `127.0.0.1`, mientras `render.yaml` usa `uvicorn ... --host 0.0.0.0`, necesario para Render.
- Un test también describe el binding local como requisito. Esto puede dar una falsa sensación de seguridad o romper el despliegue.
- **Acción:** distinguir configuración local vs. producción; en producción exigir TLS/proxy, autenticación y configuración de CORS. Actualizar tests y documentación.

### DEP-02 — Versiones declaradas inconsistentes (P1, pendiente)
- README declara Python 3.14; `render.yaml` fija Python 3.12.8. `requirements.txt`, `pyproject` (si se incorpora) y CI deben tener una fuente canónica.
- **Acción:** fijar matriz soportada, lockfile reproducible y build reproducible.

### DEP-03 — Arranque y apagado frágiles (P2, pendiente)
- `main.py` lanza una tarea de prewarm y la cancela sin esperar su finalización. `start.sh`/`stop.sh` usan PID y procesos externos que deben validarse ante PID obsoleto, doble arranque y señales.
- **Acción:** usar supervisor/container process model, manejo de `SIGTERM`, readiness/liveness separados y logs estructurados.

### DEP-04 — Health check superficial (P2, pendiente)
- `/health` devuelve siempre `healthy` sin comprobar persistencia, proveedores, versión ni estado de caché.
- **Acción:** separar `/live` y `/ready`, no exponer información innecesaria, y comprobar dependencias solo en readiness.

---

## 4. Backend y arquitectura

### API-01 — Excepciones genéricas (P1, pendiente)
- Hay numerosos `except Exception` en routers y servicios (`routers/`, `services/`, clientes externos). Esto puede convertir errores de programación en respuestas vacías o datos parciales.
- **Acción:** capturar excepciones específicas, registrar con contexto/correlation-id, mapear errores a HTTP consistentes y dejar que los bugs inesperados fallen en tests.

### API-02 — Contratos REST sin fuente tipada única (P1, pendiente)
- El frontend consume endpoints manualmente y no se ve un cliente generado desde OpenAPI ni modelos compartidos.
- **Acción:** definir Pydantic request/response models para cada endpoint, respuestas de error uniformes, versionado y generación de tipos TypeScript.

### DATA-01 — Lock solo intra-proceso (P1, pendiente)
- `AtomicJsonDatabase` usa `threading.RLock()`, que no evita que dos workers/procesos escriban el mismo JSON simultáneamente.
- **Acción:** file lock multiplataforma o migrar a SQLite/PostgreSQL; añadir test con procesos concurrentes.

### DATA-02 — Recuperación destructiva de JSON corrupto (P1, pendiente)
- `load()` renombra el archivo corrupto y guarda defaults automáticamente. Es útil para disponibilidad, pero puede ocultar corrupción y presentar una cartera vacía como válida.
- **Acción:** estado de error explícito, backup con retención, alerta/metric, restauración confirmada y no sobrescribir sin consentimiento.

### DATA-03 — Atomicidad incompleta del directorio (P2, pendiente)
- Se hace `fsync` del archivo, pero no se observa `fsync` del directorio después de `replace`; tampoco hay esquema/versionado/migraciones.
- **Acción:** documentar garantías por sistema operativo, sincronizar directorio cuando aplique y agregar versionado de formato.

### CACHE-01 — Caché de disco sin límite ni coordinación suficiente (P1, pendiente)
- `cache_service.py` carga y reescribe el JSON completo por función, persiste en background, ignora excepciones y no impone TTL/limpieza al hidratar ni límite de entradas en disco.
- Dos escrituras pueden basarse en snapshots distintos y perder resultados.
- **Acción:** reutilizar persistencia atómica con lock, limitar tamaño/edad, compactar, validar datos y usar SQLite/Redis si crece.

### CACHE-02 — Clave de caché frágil (P2, pendiente)
- La clave es `str(args) + str(kwargs)`: puede colisionar, depender de representación y no normalizar kwargs.
- **Acción:** serialización canónica/hash estable con versión de función y parámetros relevantes.

### API-03 — Prewarm bloqueante y externo (P2, pendiente)
- El prewarm inicia llamadas a proveedores externos al arrancar y puede consumir recursos/arranque sin límites claros.
- **Acción:** job opcional, timeout, backoff, métricas y no bloquear readiness.

### API-04 — Validación financiera centralizada (P1, pendiente)
- Revisar consistencia de unidades ARS/USD, fechas, redondeos, NaN/inf, ticker normalizado y timezone. Todo resultado debe indicar fuente, timestamp, moneda y calidad del dato.
- Añadir invariantes: pesos suman 100%, nominales no negativos, vencimientos válidos y cotizaciones no negativas.

### API-05 — Observabilidad (P2, pendiente)
- `X-Process-Time` expone tiempo sin correlation-id ni métricas agregadas.
- **Acción:** logging JSON, request-id, métricas de latencia/error/cache/proveedor y trazas; evitar datos sensibles en logs.

---

## 5. Frontend y experiencia de usuario

### FE-01 — Sin lint, tests ni accesibilidad automatizada (P1, pendiente)
- `frontend/package.json` solo define `dev`, `build` y `preview`; no hay ESLint, Vitest/RTL, Playwright ni axe.
- **Acción:** añadir lint/format, tests unitarios de hooks/store, smoke E2E de cada flujo crítico y chequeos WCAG.

### FE-02 — Cliente HTTP y estados de error (P1, pendiente)
- Auditar cada vista para confirmar loading/error/empty/stale states, cancelación de requests, reintentos con backoff y mensajes accionables.
- Centralizar cliente API, timeout, normalización de errores y cache client-side para evitar lógica duplicada.

### FE-03 — Tipos y duplicación de modelos (P1, pendiente)
- Evitar interfaces repetidas por componente y casts; generar tipos desde OpenAPI o mantener un paquete de contratos.
- Revisar componentes grandes (`MarkowitzLab`, vistas de portfolios/market) para separar fetching, cálculo, presentación y modales.

### FE-04 — Tema aparentemente fijo (P2, pendiente)
- `useChartTheme.ts` indica que por ahora siempre devuelve tokens dark. Confirmar que no existan controles de tema o estilos contradictorios.
- **Acción:** tokens centralizados, contraste, responsive y prueba visual de gráficos/tablas en pantallas pequeñas.

### FE-05 — Dependencias y bundle (P2, pendiente)
- Hay `echarts`, `recharts` y `framer-motion`; revisar si todas se usan y si existe duplicación funcional. `license` ISC del package no coincide necesariamente con la licencia MIT del repositorio.
- **Acción:** eliminar dependencias sin uso, auditar bundle, lockfile en CI y aclarar licencia del frontend.

### FE-06 — Seguridad de datos en UI (P1, pendiente)
- Confirmar que ningún texto del usuario se inserta como HTML, que tickers/nombres se validan también en backend y que no se persisten datos sensibles en `localStorage` sin justificación.

---

## 6. Calidad, pruebas y mantenibilidad

### QA-01 — Pipeline incompleto (P1, pendiente)
- `scripts/test.sh` ejecuta `unittest` y auditorías, pero no lint, cobertura, build frontend completo, `npm audit`, migraciones ni pruebas de concurrencia.
- El mensaje “100%” significa que los pasos pasaron, no cobertura real.
- **Acción:** CI reproducible con fallos bloqueantes, cobertura mínima razonable, `pytest`, typecheck, lint, build y reporte de artefactos.

### QA-02 — Tests acoplados a implementación (P2, pendiente)
- Revisar tests que inspeccionan texto/configuración en lugar de comportamiento (p. ej. binding declarado). Mantener contract tests HTTP y tests de integración con proveedores simulados.

### QA-03 — Proveedores externos no deterministas (P1, pendiente)
- BYMA, MAE, TradingView/Yahoo y calendario pueden cambiar formato, fallar o aplicar rate limits.
- **Acción:** adapters con schemas, fixtures/vcr, contract tests, timeouts, circuit breaker y fallback explícito con timestamp de stale data.

### QA-04 — Código duplicado y módulos extensos (P2, pendiente)
- `portfolio_service.py`, clientes y `fixed_income_service.py` concentran responsabilidades y múltiples bloques de recuperación.
- **Acción:** extraer dominio, repositorios, validadores, proveedores y serializadores; eliminar funciones muertas y nombres ambiguos tras medir dependencias.

### QA-05 — Calidad estática Python (P2, pendiente)
- Incorporar Ruff/Black/isort, mypy/pyright y reglas de complejidad/código muerto. Sustituir `print()` de librerías por logging; mantener `print()` solo en CLI.

---

## 7. Documentación

### DOC-01 — Inventario contradictorio (P1, pendiente)
- README habla de 10 repositorios JSON, pero también existen `.cache_market.json`, `portfolios_trash.json` y archivos de ejemplo. Actualizar tabla, política de versionado y qué archivos son generados/locales.

### DOC-02 — README vs implementación (P1, pendiente)
- Revisar afirmaciones de “Cero código muerto”, “host estricto”, “CSP estricta”, “más de 130 tests”, “solo SPA” y “exclusivamente REST” contra el estado real y el despliegue.
- Documentar explícitamente que Render usa `0.0.0.0` y qué controles compensatorios existen.

### DOC-03 — Contratos operativos ausentes (P2, pendiente)
- Añadir guía de configuración por entorno, matriz de variables, backup/restore, migraciones, troubleshooting, arquitectura actualizada y runbook de incidentes.

### DOC-04 — Datos y fórmulas (P1, pendiente)
- Cada métrica debe documentar fuente, frecuencia, timezone, moneda, tratamiento de datos faltantes y fórmula. Añadir fecha de actualización de datasets y disclaimer visible también en la UI.

### DOC-05 — ADRs y decisiones (P3, pendiente)
- Registrar decisiones sobre JSON vs. base de datos, persistencia local, autenticación, proveedores externos, caché y despliegue. Evita contradicciones futuras entre bitácora, README y código.

---

## 8. Orden recomendado de trabajo

1. Resolver autenticación/alcance local, CORS y política de despliegue (`SEC-01`, `SEC-02`, `DEP-01`).
2. Proteger datos y persistencia: locks multiproceso, recuperación no destructiva, backups y migraciones (`DATA-01..03`).
3. Formalizar contratos y manejo de errores (`API-01..04`) y aislar proveedores externos.
4. Completar CI: typecheck, lint, tests frontend/E2E, cobertura y auditorías de dependencias (`QA-01..05`).
5. Corregir estados UX, accesibilidad y modelos compartidos (`FE-01..06`).
6. Sincronizar README, docs y runbooks (`DOC-01..05`).
7. Refactorizar duplicación y módulos grandes solo después de disponer de cobertura y métricas (`QA-04`).

## 9. Registro de verificación

- [ ] Ejecutar `./scripts/test.sh` y adjuntar salida/fecha.
- [ ] Ejecutar build frontend limpio sin `node_modules` ni `dist` preexistentes.
- [ ] Probar concurrencia de dos workers/procesos escribiendo el mismo recurso.
- [ ] Probar corrupción, recuperación y restauración de cada JSON.
- [ ] Probar CORS desde origen permitido, no permitido y subdominio no confiable.
- [ ] Ejecutar secret/dependency scanning.
- [ ] Verificar que no se exponen datos personales en respuestas, logs, backups ni errores.
- [ ] Actualizar este archivo al cerrar cada hallazgo con commit, evidencia y fecha.

---

# 10. Guía de implementación de las mejoras

Esta sección convierte cada hallazgo en una propuesta técnica ejecutable. Antes de aplicar cambios que afecten persistencia o seguridad, crear una rama, realizar backup de `data/` y añadir primero las pruebas de regresión.

## 10.1 Seguridad y privacidad

### SEC-01 — Autenticación y autorización
1. Declarar el alcance: modo local sin usuarios o aplicación multiusuario.
2. Para multiusuario, crear modelos `User`, `Session` y permisos por cartera; almacenar contraseñas únicamente con Argon2/bcrypt.
3. Implementar login/logout, cookies `HttpOnly`, `Secure` en producción y `SameSite=Lax/Strict`.
4. Añadir dependencias por recurso: cada endpoint debe verificar que la cartera pertenece al usuario autenticado.
5. Proteger mutaciones con CSRF si se usan cookies y registrar acciones sensibles.
6. Añadir tests de acceso anónimo, acceso cruzado entre usuarios y escalada de permisos.

### SEC-02 — CORS
1. Crear configuración por entorno (`APP_ENV`, `ALLOWED_ORIGINS`).
2. En desarrollo permitir únicamente localhost; en producción usar una lista exacta de dominios.
3. Eliminar el regex `.*.onrender.com` y `allow_credentials=True` si no hay cookies/sesiones.
4. Probar `OPTIONS`, origen permitido, origen desconocido y subdominio no autorizado.

### SEC-03 — CSP
1. Ejecutar la SPA con la CSP en modo `Content-Security-Policy-Report-Only` y revisar reportes.
2. Eliminar `unsafe-eval`; reemplazar estilos inline por clases/tokens o hashes.
3. Añadir `object-src 'none'`, `base-uri 'self'` y `form-action 'self'`.
4. Mantener `frame-ancestors 'none'`; retirar `X-XSS-Protection` salvo compatibilidad documentada.
5. Validar el build con un smoke test que compruebe headers y carga de gráficos.

### SEC-04 — Límites y abuso
1. Definir límites Pydantic para strings, listas, cantidad de activos y tamaño de payload.
2. Configurar timeout de conexión/lectura en cada cliente externo.
3. Añadir rate limiting por IP/usuario y límites específicos para cálculos costosos.
4. Rechazar explícitamente `NaN`, infinitos, fechas inválidas y valores financieros imposibles.
5. Añadir tests de payload excesivo, requests concurrentes y proveedores lentos.

### SEC-05/06 — Datos privados y scanning
1. Separar datos demo, datos locales y datos de producción mediante rutas/configuración distintas.
2. Confirmar permisos de archivos y directorios al iniciar la aplicación.
3. Añadir secret scanning, `pip-audit`, `npm audit`, Bandit/Semgrep y ejecución en CI.
4. Sanitizar logs con filtros de campos sensibles y probar que una excepción no imprime payloads.

## 10.2 Despliegue y configuración

### DEP-01 — Binding
1. Mantener `127.0.0.1` para scripts locales.
2. Mantener `0.0.0.0` únicamente en Render, donde lo requiere el router del proveedor.
3. Actualizar README y tests para distinguir `local`, `test` y `production`.
4. En producción exigir HTTPS, autenticación, CORS estricto y variables secretas del proveedor.

### DEP-02 — Versiones
1. Elegir una versión soportada de Python y documentarla en `.python-version` o `pyproject.toml`.
2. Hacer coincidir esa versión con `render.yaml`, CI y README.
3. Regenerar lockfiles y probar una instalación desde cero.

### DEP-03/04 — Proceso y health checks
1. Sustituir PID manual por un único proceso supervisor o contenedor cuando sea posible.
2. Implementar manejo de `SIGTERM`, espera de tareas y cierre del executor de caché.
3. Crear `/live` (proceso activo) y `/ready` (dependencias disponibles), con timeouts.
4. Configurar health check de Render contra `/live` o `/ready` según el objetivo.

## 10.3 Backend, persistencia y caché

### API-01 — Errores
1. Definir excepciones de dominio (`ProviderError`, `ValidationError`, `PersistenceError`).
2. Usar handlers FastAPI que devuelvan un formato estable: `code`, `message`, `request_id` y detalles seguros.
3. Reemplazar `except Exception` por excepciones específicas; usar `logger.exception` cuando se conserve contexto.
4. No devolver datos vacíos como si fueran válidos: distinguir `null`, stale data y error.

### API-02 — Contratos
1. Crear modelos Pydantic de entrada y salida para cada router.
2. Añadir ejemplos y códigos de respuesta al OpenAPI.
3. Generar tipos TypeScript desde OpenAPI y centralizar el cliente HTTP.
4. Añadir contract tests que comparen respuesta real con el schema.

### DATA-01 — Escritura multiproceso
1. Añadir lock de archivo con una librería multiplataforma o migrar directamente a SQLite.
2. Mantener la escritura temporal, `fsync` y `os.replace` dentro del lock.
3. Añadir test con dos procesos que incrementen el mismo registro y comprobar que no se pierde ninguna actualización.
4. Documentar que JSON no es una base adecuada para despliegues con múltiples workers.

### DATA-02/03 — Corrupción, backups y migraciones
1. Validar el JSON con schema antes de aceptarlo como estado válido.
2. Ante corrupción, mover el archivo a una carpeta de cuarentena con timestamp, emitir alerta y marcar el sistema como no listo.
3. Restaurar defaults solo mediante comando explícito o modo de recuperación.
4. Hacer backup versionado antes de migraciones y guardar un campo `schema_version`.
5. Probar corte durante escritura, JSON truncado, permisos insuficientes y rollback.

### CACHE-01/02 — Caché
1. Crear una única capa de persistencia atómica para cache y datos de negocio.
2. Generar claves con JSON canónico (`sort_keys=True`) y hash, incluyendo versión de función y parámetros.
3. Guardar timestamp, TTL, versión y tamaño; purgar entradas vencidas y limitar el archivo.
4. Evitar leer-modificar-escribir sin lock; preferir SQLite/Redis cuando haya varios workers.
5. No ignorar silenciosamente errores de escritura: registrar warning con métricas.

### API-03/04/05 — Proveedores, datos y observabilidad
1. Mover cada proveedor a un adapter con schema de respuesta y normalización propia.
2. Usar timeout, reintentos acotados, backoff y circuit breaker.
3. Incluir en cada resultado `source`, `retrieved_at`, `currency`, `timezone` y `is_stale`.
4. Crear request-id middleware, logs JSON y métricas de latencia, errores y cache hit ratio.
5. Hacer que el prewarm sea opcional, no bloquee readiness y se cancele limpiamente.

## 10.4 Frontend y UX

### FE-01 — Calidad automática
1. Añadir ESLint, Prettier, Vitest, React Testing Library, Playwright y axe.
2. Crear scripts `lint`, `format:check`, `test`, `test:e2e`, `build` y `typecheck`.
3. Ejecutarlos en CI junto con el backend.

### FE-02/03 — Cliente y tipos
1. Implementar un cliente API único con timeout, abort controller y normalización de errores.
2. Usar una estrategia de fetching/cache consistente, evitando requests duplicadas.
3. Generar tipos desde OpenAPI y eliminar interfaces repetidas y casts inseguros.
4. Cubrir loading, error, vacío, stale data y reintento en cada vista.

### FE-04/05 — Tema, bundle y dependencias
1. Centralizar tokens de color, espaciado y tipografía.
2. Verificar contraste, navegación por teclado, foco visible, labels y responsive.
3. Medir bundle y eliminar librerías sin uso o funcionalidades duplicadas.
4. Revisar licencias de dependencias y alinear la licencia declarada del paquete con la del proyecto.

### FE-06 — Datos en la interfaz
1. Renderizar nombres y tickers como texto; no usar `dangerouslySetInnerHTML` sin sanitización estricta.
2. No guardar holdings en `localStorage` salvo una decisión explícita y documentada.
3. Validar en frontend solo como ayuda UX; repetir siempre la validación en backend.

## 10.5 Tests, mantenibilidad y documentación

### QA-01/02 — Pipeline
1. Migrar gradualmente a `pytest` si aporta fixtures y parametrización, manteniendo compatibilidad durante la transición.
2. Añadir cobertura, lint, typecheck, build, auditoría de dependencias y pruebas de migración.
3. Definir umbrales razonables y publicar reports como artefactos.
4. Preferir tests de comportamiento HTTP y dominio sobre tests que solo inspeccionan texto interno.

### QA-03 — Proveedores externos
1. Guardar fixtures anonimizadas de respuestas reales.
2. Simular timeout, rate limit, JSON cambiado, datos vacíos y valores stale.
3. Crear contract tests periódicos separados de la suite rápida.

### QA-04/05 — Refactor
1. Medir complejidad y duplicación antes de modificar módulos grandes.
2. Extraer primero funciones puras y validadores, cubriéndolos con tests.
3. Separar router, caso de uso, repositorio, proveedor y serializador.
4. Aplicar Ruff/Black/isort y mypy/pyright de forma incremental, corrigiendo primero errores de alto riesgo.

### DOC-01..05 — Documentación
1. Generar el inventario de `data/` desde una tabla mantenida junto al código y marcar archivos generados/privados.
2. Revisar README contra `main.py`, `render.yaml`, scripts y package manifests en cada release.
3. Añadir `docs/operaciones.md`, `docs/configuracion.md`, `docs/backup_restore.md` y `docs/arquitectura.md`.
4. Documentar fuente, moneda, timezone, fórmula, timestamp y tratamiento de faltantes para cada métrica.
5. Registrar decisiones relevantes como ADRs con contexto, alternativas y consecuencias.

## 10.6 Criterio de cierre

Una mejora se considera cerrada únicamente cuando:

- existe un commit identificable y una prueba automatizada o evidencia reproducible;
- la documentación y configuración ya no se contradicen;
- se verificó el comportamiento normal y el caso de error;
- se revisaron logs, privacidad, rendimiento y compatibilidad;
- se actualizó el estado y la fecha en la tabla de este documento.

---

## 11. Segunda revisión de errores — posterior a la auditoría de publicación

> Esta sección registra hallazgos observados después de ejecutar la suite completa de verificación antes de publicar el repositorio. Es una lista de trabajo pendiente para futuras iteraciones. Un LLM debe tratar estos puntos como deuda técnica confirmada por evidencia, no como fallos que bloqueen automáticamente la publicación actual.

### REV-01 — Conexiones SQLite no cerradas (P2, pendiente)
- **Evidencia:** `./scripts/test.sh` completó correctamente los 146 tests, pero mostró múltiples `ResourceWarning: unclosed database` durante los tests de Markowitz.
- **Riesgo:** consumo gradual de descriptores/conexiones y comportamiento menos estable en sesiones largas.
- **Acción futura:** identificar el propietario de cada conexión, usar context managers o cerrar explícitamente conexiones/cursors, y añadir una prueba que no produzca `ResourceWarning`.
- **Criterio de cierre:** suite completa sin advertencias de conexiones SQLite abiertas.

### REV-02 — API de TestClient/dependencia HTTP obsoleta (P2, pendiente)
- **Evidencia:** la suite muestra `StarletteDeprecationWarning` indicando que el uso actual de `httpx` con `starlette.testclient` está obsoleto.
- **Riesgo:** una actualización futura de Starlette/httpx podría romper la suite de tests.
- **Acción futura:** revisar `requirements.txt` y la combinación FastAPI/Starlette/httpx; actualizar la dependencia o adaptar el uso de `TestClient` conforme a la API soportada.
- **Criterio de cierre:** suite completa sin `StarletteDeprecationWarning` y dependencias fijadas de forma reproducible.

### Instrucción para futuras revisiones

Antes de cerrar `REV-01` o `REV-02`, ejecutar nuevamente:

```bash
./scripts/test.sh
```

No marcar estos hallazgos como resueltos solo porque los tests terminen con código `0`: las advertencias también deben desaparecer o quedar justificadas explícitamente.
