# Project Canonical Rules (Golden Path)

This document unifies the core architectural, testing, and operational rules governing this project.

## Document Precedence Hierarchy (Fuente Única de Verdad)

En caso de discrepancia o contradicción entre documentos y código, prevalece el siguiente orden jerárquico estricto:

```text
.agents/hooks.json > scripts/ & .agents/scripts/ > tests/ > .agents/RULES.md > WORKFLOW.md > README.md
```

1. **Configuración Activa del Harness (`hooks.json`)**: Regula qué herramientas se interceptan físicamente en tiempo real.
2. **Scripts Ejecutables de Control (`scripts/`, `.agents/scripts/`)**: Lógica ejecutable de auditoría y guardrails.
3. **Suite Automatizada de Pruebas (`tests/`)**: Contratos empíricos verificados por el intérprete.
4. **Reglas Canónicas del Proyecto (`RULES.md`)**: Políticas operativas acordadas para los agentes.
5. **Protocolos de Proceso (`WORKFLOW.md`)**: Guías de flujo de trabajo, Pareto 80/20 y RODA.
6. **Documentación del Producto (`README.md`)**: Visión general orientada al usuario y desarrollador externo.

---

## Canonical Rules Classification

Cada regla canónica está clasificada según su mecanismo de cumplimiento real:
- `[ENFORCED]`: Interceptada y bloqueada programáticamente en tiempo real por hooks de Antigravity (`hooks.json`).
- `[VERIFIED]`: Comprobada de forma determinista por la suite de tests automatizados y scripts de auditoría en `./scripts/test.sh`.
- `[PARTIAL]`: Controlada mediante análisis de patrones o verificación en casos específicos, reconociendo limitaciones de entorno (no sustituye un sandbox OS a bajo nivel).
- `[CONVENTION]`: Patrón de diseño o disciplina arquitectónica mantenida por el par de programación.

---

1. `[PARTIAL]` **Central Library Read-Only Invariant**: La biblioteca central en `/run/media/.../contenido agentico/` es estrictamente de SOLO LECTURA. `command-guard` intercepta y bloquea comandos de shell que contengan patrones de modificación o borrado directo sobre dicha ruta. *(Limitación: no sustituye un sistema de archivos de solo lectura a nivel kernel o contenedor aislado).*
2. `[VERIFIED]` **Local Privacy & Zero Leakage**: Ejecución local; cero secretos, tokens, credenciales o claves privadas en archivos rastreados. Verificado por `scripts/audit_security_privacy.py`.
3. `[VERIFIED]` **Strict Localhost Binding**: Los servicios de desarrollo escuchan exclusivamente en `127.0.0.1`. Verificado mediante assertions en `tests/test_security_service.py`.
4. `[VERIFIED]` **Zero Trust Validation**: Todas las entradas son validadas con esquemas estrictos de Pydantic v2 y filtros de sanitización XSS/inyección. Verificado en `tests/test_security_service.py`.
5. `[CONVENTION]` **POSIX Atomic Writes**: Persistencia en disco a través de archivo temporal (`.tmp`), `flush`, `fsync` y reemplazo atómico (`os.replace`). Implementado en `services/atomic_persistence.py`.
6. `[VERIFIED]` **Snapshot Isolation**: Las suites de tests ejecutan sobre entornos efímeros (`tempfile.TemporaryDirectory()`) para evitar contaminar o alterar los datos reales de `data/*.json`.
7. `[VERIFIED]` **Adaptive TDD**: Red-Green-Refactor estricto para lógica financiera y matemática; verificación estática (`tsc --noEmit`) para UI. Comprobado en `./scripts/test.sh`.
8. `[CONVENTION]` **RODA Protocol**: Read Once, Decide, Act. Minimizar consumo de tokens e inspecciones redundantes.
9. `[ENFORCED]` **Token Guard**: Intercepta llamadas a `view_file` de archivos con más de 350 líneas sin especificar rangos `StartLine`-`EndLine`. Opera en política **fail-closed**.
10. `[ENFORCED]` **Destructive Command Guard**: Intercepta comandos de shell (`rm -rf /`, `mkfs`, fork bombs, apagado) en `run_command`. Opera en política **fail-closed** ante comandos vacíos o payloads corruptos.
11. `[CONVENTION]` **Context Saturation Management**: Rotación de sesión de chat a un nuevo contexto al alcanzar 20-25 intercambios o 10 artefactos.
12. `[CONVENTION]` **Pareto 80/20 Focus**: Priorizar la funcionalidad de mayor apalancamiento; eliminar complejidad accidental y código muerto.
13. `[VERIFIED]` **Pre-Push Quality Gate Invariant**: Es obligatorio que `./scripts/test.sh` pase al 100% de manera determinista antes de realizar, autorizar o sugerir cualquier `git push`. Ningún cambio o commit puede ser promovido hacia el repositorio remoto sin validación local previa (incluyendo tipos TypeScript, suite de tests aislada, clean-checkout y auditorías de seguridad).
14. `[CONVENTION]` **Contract Synchronization Rule**: Cualquier modificación en contratos de entrada/salida (esquemas Pydantic, endpoints de API) o en lógica de utilidades temporales/financieras (cálculo de fechas, ventanas temporales, estimación de covarianza, optimizadores) DEBE sincronizarse en el mismo commit atómico con sus correspondientes pruebas unitarias en `tests/`. Queda terminantemente prohibido desacoplar cambios funcionales de sus tests asociados.
15. `[VERIFIED]` **Zero Deprecation Warning Policy**: Toda configuración de herramientas (como `pytest.ini`, linters o parsers) debe fijar explícitamente parámetros que eliminen advertencias de deprecación futuras en entornos de CI (ej. `asyncio_mode = auto` y `asyncio_default_fixture_loop_scope = function` en `pytest-asyncio`). Las advertencias en CI no deben considerarse benignas ni dejarse sin fijar.
16. `[ENFORCED]` **Anti-Loop Guard (Límite de 2 Reintentos)**: Límite estricto de máximo 2 intentos de autocorrección ante fallos de tests o compiladores. Si al segundo intento el error persiste, el orquestador y los subagentes deben abortar la iteración, aislar la causa raíz y pausar inmediatamente para consultar al usuario con un diagnóstico claro.
17. `[ENFORCED]` **Directory Confinement Invariant**: Toda lectura (`view_file`), escritura (`write_to_file`) y ejecución de shell (`run_command`) debe restringirse estrictamente dentro de la raíz del proyecto. Queda prohibido el acceso a directorios superiores (`../`, `~`, `/`).
18. `[CONVENTION]` **Interface-First Contract Rule**: Ante tareas fullstack que involucren Backend y Frontend, se deben definir y consensuar primero los esquemas Pydantic v2 / contratos JSON compartidos antes de implementar la UI o la lógica de consumo.
19. `[ENFORCED]` **Zero Secrets Injection to Subagents**: Queda prohibido inyectar archivos `.env`, tokens o credenciales reales en los sub-prompts delegados a los subagentes. Solo se transfieren nombres de variables de entorno, plantillas o mocks.
20. `[CONVENTION]` **Approved Historical Portfolio Data**: El repositorio es público y los portfolios/datos financieros que ya constan en el historial Git han sido revisados y aprobados por el propietario del proyecto; no deben volver a reportarse como riesgo ni bloquear `git add`, commit o push. Solo deben elevarse datos nuevos no aprobados, secretos, credenciales o información sensible distinta de esos datos históricos.
