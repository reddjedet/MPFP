# 🛡️ Política de Seguridad (Security Policy) — MPFP

## Versiones Soportadas

Actualmente se brinda soporte de parches de seguridad a la última versión principal (`main`):

| Versión | Soportada |
| :--- | :--- |
| `1.0.x` | :white_check_mark: |
| `< 1.0` | :x: |

---

## Reporte Responsable de Vulnerabilidades

La seguridad y la integridad de los datos financieros son pilares fundamentales de este proyecto. Si descubres una vulnerabilidad o un problema de seguridad potencial, te solicitamos encarecidamente que **no abras un issue público**.

### Procedimiento:
1. Contacta de forma privada mediante un [GitHub Security Advisory](https://github.com/) en este repositorio o enviando un correo al mantenedor.
2. Proporciona:
   - Descripción detallada de la vulnerabilidad.
   - Pasos para reproducirla (Proof of Concept o vector de ataque).
   - Módulos afectados (e.g. FastAPI backend, React SPA, Atomic Database).
   - Impacto potencial estimado.

### Tiempos de Respuesta:
- **Acuse de recibo:** Menos de 48 horas.
- **Evaluación y remediación:** Se priorizará un parche en rama privada y se emitirá una actualización formal de seguridad.

---

## Directrices de Seguridad del Sistema

1. **Localhost Binding:** Por diseño, el backend y el frontend están concebidos para ejecutarse vinculados estrictamente a `127.0.0.1`.
2. **Sin Almacenamiento de Credenciales:** El sistema no almacena ni requiere credenciales bancarias ni claves privadas en el repositorio.
3. **Persistencia Atómica:** La base de datos opera bajo el protocolo de escritura segura `.tmp` + `os.replace` para evitar corrupción de datos por terminaciones abruptas.
