"""Contratos estáticos del Relative Rotation Graph (RRG) en el frontend."""

import re
from pathlib import Path

from services.etf_rrg_service import QUADRANT_LABELS


PROJECT_ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = PROJECT_ROOT / "frontend/src/components/market/EtfRotationGraph.tsx"
VIEW_PATH = PROJECT_ROOT / "frontend/src/components/market/EtfRotationView.tsx"
HOOK_PATH = PROJECT_ROOT / "frontend/src/hooks/useEtfRotation.ts"


def _graph_source() -> str:
    return GRAPH_PATH.read_text(encoding="utf-8")


def _hook_source() -> str:
    return HOOK_PATH.read_text(encoding="utf-8")


def test_frontend_quadrant_labels_match_backend():
    """Un swap Improving/Weakening en la UI debe romper este contrato."""
    source = _graph_source()
    meta_block = re.search(r"const QUADRANT_META[\s\S]*?\n};", source)
    assert meta_block is not None, "No se encontró QUADRANT_META"

    for quadrant, expected_label in QUADRANT_LABELS.items():
        match = re.search(
            rf"{quadrant}:\s*\{{.*?label:\s*'([^']+)'",
            meta_block.group(0),
            flags=re.DOTALL,
        )
        assert match is not None, f"Falta la etiqueta de {quadrant}"
        assert match.group(1) == expected_label


def test_plot_area_is_square_and_reactive():
    """La misma cantidad de píxeles por unidad evita distorsionar ángulos y colas."""
    source = _graph_source()

    assert "new ResizeObserver" in source
    assert "width: plotSide" in source
    assert "height: plotSide" in source


def test_axis_domain_uses_unfiltered_universe_and_clamps_outliers():
    """Buscar no debe reescalar, y un pico histórico no debe aplastar al resto."""
    source = _graph_source()

    assert "domainPoints?: RrgPoint[]" in source
    assert "const domainSource" in source
    assert "domainPoints && domainPoints.length > 0" in source
    assert "percentile(sortedDeviations, 0.95)" in source
    assert "headDeviation" in source


def test_trails_show_weekly_points_and_fade_history():
    """La cola debe marcar cada semana y destacar el tramo reciente."""
    source = _graph_source()

    assert "recentStart = Math.max(0, coordinates.length - 3)" in source
    assert "showSymbol: true" in source
    assert "opacity: 0.3" in source
    assert "symbolSize: 2.5" in source


def test_tail_selector_refetches_with_the_selected_window():
    """El control 4/8/12 debe pedir la cola elegida y descartar respuestas viejas."""
    source = _graph_source()
    assert "onTailChange" in source
    assert "[4, 8, 12]" in source

    hook = _hook_source()
    assert "const [rrgTail, setRrgTailState] = useState<number>(8)" in hook
    assert "tail=${tail}" in hook
    assert "requestId !== rrgRequestIdRef.current" in hook


def test_tooltip_discloses_scale_and_real_quadrant_streak():
    """La escala y la racha real deben estar en el tooltip, no solo en el código."""
    source = _graph_source()

    assert "Fuerza relativa (100 + 10·z)" in source
    assert "Momentum relativo (100 + 10·z)" in source
    assert "Escala 100 + 10·z" in source
    assert "no JdK" in source
    assert "quadrant_since" in source
    # El RSI absoluto ya vive en la tabla; dentro del RRG es ruido.
    assert "RSI 14 ETF" not in source
    assert "z 52s" not in source


def test_labels_are_shifted_before_being_hidden():
    """Un label oculto no se puede asociar a su punto."""
    source = _graph_source()

    assert "moveOverlap" in source


def test_axis_edge_labels_are_hidden():
    """El dominio dinámico deja bordes no redondos: no deben pisar los ticks."""
    source = _graph_source()
    assert source.count("showMinLabel: false") >= 2
    assert source.count("showMaxLabel: false") >= 2


def test_side_panel_lists_state_and_syncs_with_chart():
    """El panel lateral debe reflejar el estado y sincronizar hover/clic."""
    source = _graph_source()
    assert "Estado RRG" in source
    assert "hidden lg:flex" in source
    assert "dispatchAction" in source
    assert "type: 'showTip'" in source
    assert "pinnedTicker" in source
    assert "QUADRANT_ORDER" in source
    assert "ref={chartRef}" in source


def test_view_discloses_normalization_and_non_comparability():
    """La página debe aclarar la escala, que no es JdK y que no compara sectores."""
    view = VIEW_PATH.read_text(encoding="utf-8")

    assert "escala 100 + 10·z" in view
    assert "no JdK" in view
    assert "no compara sectores" in view
    assert "promedio propio de 52 semanas" in view
