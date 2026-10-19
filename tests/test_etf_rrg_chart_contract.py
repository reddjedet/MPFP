"""Contratos estáticos del Relative Rotation Graph (RRG) en el frontend."""

import re
from pathlib import Path

from services.etf_rrg_service import QUADRANT_LABELS


PROJECT_ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = PROJECT_ROOT / "frontend/src/components/market/EtfRotationGraph.tsx"
VIEW_PATH = PROJECT_ROOT / "frontend/src/components/market/EtfRotationView.tsx"


def _graph_source() -> str:
    return GRAPH_PATH.read_text(encoding="utf-8")


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


def test_axis_domain_uses_unfiltered_universe():
    """Buscar un ticker no debe reescalar los ejes ni mover los puntos."""
    source = _graph_source()

    assert "domainPoints?: RrgPoint[]" in source
    assert "const domainSource" in source
    assert "domainPoints && domainPoints.length > 0" in source


def test_trails_show_weekly_points_and_fade_history():
    """La cola debe marcar cada semana y destacar el tramo reciente."""
    source = _graph_source()

    assert "recentStart = Math.max(0, coordinates.length - 3)" in source
    assert "showSymbol: true" in source
    assert "opacity: 0.3" in source
    assert "symbolSize: 2.5" in source


def test_view_discloses_normalization_and_non_comparability():
    """La página debe aclarar que no es JdK y que no se compara con el 1W."""
    view = VIEW_PATH.read_text(encoding="utf-8")

    assert "z-score de 52 semanas (no JdK)" in view
    assert "promedio del propio ETF" in view
    assert "No comparable con el diferencial 1W" in view
