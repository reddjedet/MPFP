# Máquina de Planes, Finanzas y Portfolios (MPFP) — Reglas de Ingeniería y Mejores Prácticas (.agents/rules/best_practices.md)

Este documento establece las directrices técnicas, arquitectónicas y de calidad que deben cumplirse de manera obligatoria en el desarrollo de la aplicación.

---

## 1. 🛡️ Ciberseguridad y Privacidad Local

### Directrices de Seguridad:
1. **Zero Remote Git Push**: Todo el control de versiones reside 100% en `.git` local.
2. **Confidencialidad de PII**: Ningún dato sensible, cartera, input de valuación o cotización sale del host local (`127.0.0.1`).
3. **CORS & Host Binding**: Enlace estricto a `127.0.0.1:8000`.
4. **Persistencia Atómica POSIX Multi-Base de Datos**:
   Toda mutación en archivos JSON utiliza `AtomicJsonDatabase` (`.tmp` + `flush` + `fsync` + `replace`) con cerrojo `threading.RLock()`.
   Bases de datos cubiertas:
   - `data/portfolios.json`: Carteras de inversión y ponderaciones.
   - `data/user_holdings.json`: Cartera real de usuario (cantidades nominales, PPC y caja en ARS).
   - `data/ppc_values.json`: Precios Promedio de Compra globales para PnL.
   - `data/fair_values.json`: Valores intrínsecos de GuruFocus con persistencia unificada.
   - `data/pfcf_values.json`: Multiplicadores P/FCF normalizados históricos y percentiles.
   - `data/earnings_calendar.json`: Fechas certeras confirmadas y calendarios de balances.
   - `data/valuation_profiles.json`: Perfiles y modelos sectoriales por empresa.
   - `data/user_valuation_inputs.json`: Memoria de inputs de valuación fundamental del usuario.
   - `data/cedear_ratios.json`: Ratios oficiales de conversión CEDEAR a acción extranjera.

---

## 2. Estándares Backend (Python / FastAPI)

### 2.1 Persistencia Atómica POSIX
```python
from services.atomic_persistence import AtomicJsonDatabase
from pathlib import Path

db = AtomicJsonDatabase(Path("data/portfolios.json"))
data = db.load()
data["mi_cartera"] = {"mode": "weights", "assets": {"AAPL": 50}}
db.save(data)
```

### 2.2 Validación de Entradas con Regex y Sanitización
```python
from services.security_service import (
    sanitize_ticker, 
    sanitize_portfolio_name, 
    parse_weights_string
)
```

### 2.3 Modelos de Valuación Fundamental Adaptativa
Cada modelo debe respetar las métricas clave de su sector y clasificar el veredicto consolidado (`GREEN FLAG`, `YELLOW FLAG`, `RED FLAG` / `DESCARTE`):
- `standard_fcf`: ROIC, WACC, Spread, Net Debt/EBITDA, SBC/OCF, Shares CAGR.
- `banking`: CET1 Ratio, RoTCE/ROE, NCO Ratio, Shares CAGR.
- `financial_holding`: Look-Through Operating Earnings, Exceso de Caja, Costo del Float, Recompras.
- `industrial_dual_debt`: Deuda Neta Industrial pura aislada, FCF de ciclo medio.
- `energy_upstream`: Lifting Cost, Breakeven Brent, Deuda Neta en USD, % Ventas en USD.
- `discarded`: Diagnóstico por vía negativa de trampas de valor.

---

## 3. Estándares UI/UX (React 19 + Vite + TypeScript + Apache ECharts)

### 3.1 Directrices Visuales y Modo Oscuro Exclusivo (Eigengrau)
- **Esquema Cromático Canónico (Dark Only)**:
  - Fondo base *Eigengrau* (`#0f1015`), tarjetas y paneles institucionales profundos (`#181920` / `rgba(24, 25, 32, 0.7)`) con bordes sutiles translúcidos (`rgba(255, 255, 255, 0.08)`).
  - Tipografía y contrastes gobernados estrictamente por tokens de alto contraste (`text-white`, `text-zinc-300`, `text-zinc-400`).
  - Prohibición absoluta de reintroducir el Modo Claro o alternancias de tema. Cero lienzos claros, cero selectores `.light` en CSS y cero overrides forzados globales con `!important`.
- **Superficies Neutras y Acentos Semánticos**:
  - Las tarjetas de sugerencias, alertas y diagnósticos deben conservar superficies neutras oscuras (`#181920` / `bg-white/[0.02]`), aplicando el color semántico exclusivamente a insignias/badges compactos (`↗ COMPRAR`, `↘ VENDER`, `⚠️ TAKE PROFIT`).
  - Prohibición estricta de fondos saturados completos monocromáticos (cero verde-sobre-verde, cero rojo-sobre-rojo, cero fondos grises planos).
- **Garantía de Cero Scroll Horizontal ($\ge 1366\times 768$)**:
  - Todas las tablas maestras de datos financieros (CEDEARs, Cartera & Rotación, Balances, PPC, Fair Value) deben entrar al 100% de ancho sin barra de desplazamiento horizontal en pantallas de escritorio estándar ($\ge 1366\text{px}$).
  - Las celdas deben compactarse (`px-2 py-1.5`), los encabezados abreviarse y los valores numéricos expresarse con tipografía tabular compacta (`text-xs tabular-nums`).
- **Tipografía y Legibilidad**:
  - Escala modular balanceada (`Inter` / `JetBrains Mono`). Contraste verificado WCAG AA ($\ge 4.5:1$).
  - Insignias de oportunidad (`🟢 ÓPTIMO`, `Subval. >= 25%`) y badges energéticos con animación suave para balances en $< 14$ días.

### 3.2 Componentes Canónicos y Bloques Reutilizables (`components/ui/`)
- **Selectores y Menús Desplegables**: Uso obligatorio del componente canónico `<Dropdown />` (`components/ui/Dropdown.tsx`). Encapsula de fábrica accesibilidad por teclado (`Escape`), detección de clic exterior, elevación dinámica de stacking context (`z-50`) y estilos Eigengrau con soporte para acentos (`blue` / `emerald`). Prohibido programar selectores ad-hoc con hooks locales o usar `<select>` nativos.
- **Visualizaciones ECharts**: Importación estricta del núcleo (`echarts-for-react/lib/core`) con desenvolvimiento defensivo CJS/ESM (`(RawComponent as any)?.default || RawComponent`) para evitar React Error #130.
- **Contención de Fallos**: Vistas dinámicas protegidas con Error Boundaries reactivos (`key={activeTab}`).
- **Mutaciones Consolidadas**: Tablas principales de lectura limpia (Read-Only) y edición masiva centralizada en cajones de acción (*ActionDrawers*).

---

## 4. Control de Calidad y Testing

### 4.1 Aislamiento Efímero en Tests (*Snapshot Isolation con tempfile*)
Todo módulo de test que interactúe con repositorios que persisten datos debe aplicar aislamiento por directorios temporales:
```python
import tempfile
from pathlib import Path

@classmethod
def setUpClass(cls):
    cls._tmp_dir = tempfile.TemporaryDirectory()
    cls._orig_path = _db.file_path
    _db.file_path = Path(cls._tmp_dir.name) / "service_data.json"
    _db._cache = None
    _db._cache_valid = False

@classmethod
def tearDownClass(cls):
    _db.file_path = cls._orig_path
    _db._cache = None
    _db._cache_valid = False
    cls._tmp_dir.cleanup()
```

### 4.2 Verificación Obligatoria
- **Pipeline Integral**: Ejecución de `./test.sh` (compilación TypeScript y Vite en frontend + 93 tests de backend).
- **Herramienta de Diagnóstico**: Verificación de las 9 bases de datos JSON, ciberseguridad y suite con `python scripts/audit_project.py`.
- **Cero Polución**: `git status data/` debe permanecer 100% limpio tras la ejecución de tests.

---

## 5. 📖 Referencias de Gobernanza y Aprendizaje

Para profundizar en los incidentes resueltos, los anti-patrones erradicados y la evolución técnica del sistema, consultar:
- `docs/aprendizaje_de_errores.md`: Registro exhaustivo de incidentes (INC-01 a INC-17) y 17 Reglas de Oro Inquebrantables.
- `docs/bitacora.md`: Bitácora cronológica de migración y purga del stack anterior.
- `instructivo.md`: Formulación matemática cuantitativa, PnL y algoritmos de rebalanceo.
- `docs/data_science/README.md`: Módulos teóricos y prácticos de finanzas cuantitativas.


---

## 7. ⚡ Eficiencia de Tokens & Delegación de Agentes (Spotify Pattern)

Para optimizar el uso de contexto y reducir consumo innecesario de tokens:
1. **Gating de Archivos Grandes (> 350 líneas)**:
   - El sistema cuenta con un hook activo (`.agents/hooks.json`) que bloquea lecturas completas de archivos que superen las 350 líneas.
   - Para inspeccionar archivos grandes (como `services/markowitz_service.py`, `services/clients/mae_client.py`, `services/valuation_service.py`), se debe:
     - **Opción A**: Invocar un subagente de tipo `research` con `Model: "flash_lite"` o `Model: "flash"` solicitándole únicamente la función, clase o lógica puntual requerida.
     - **Opción B**: Leer rangos específicos con `StartLine` y `EndLine` ($\le 350$ líneas).
2. **Generación de Código Repetitivo**:
   - Para suites de tests, scripts de migración o código boilerplate, delegar a subagentes con `Model: "flash"` para que escriban el código directamente a disco (`write_to_file`) sin saturar el contexto del orquestador principal.
