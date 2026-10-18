"""Contratos estáticos de la UI para regresiones sin runner JavaScript."""

import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
CREATE_MODAL = ROOT_DIR / "frontend/src/components/portfolio/CreatePortfolioModal.tsx"
HOLDINGS_MODAL = ROOT_DIR / "frontend/src/components/portfolio/HoldingsManagerView.tsx"
HOLDINGS_HOOK = ROOT_DIR / "frontend/src/hooks/useHoldingsManager.tsx"


class TestCreatePortfolioFormDefaults(unittest.TestCase):
    def setUp(self):
        self.src = CREATE_MODAL.read_text(encoding="utf-8")

    def test_opens_with_sixteen_blank_asset_rows_and_resets_each_time(self):
        self.assertIn("Array.from({ length: 16 }, () => ({ ticker: '', value: '' }))", self.src)
        self.assertIn("setRows(createBlankRows())", self.src)
        self.assertIn("setRawText('')", self.src)
        self.assertIn("}, [isOpen]);", self.src)

    def test_added_rows_and_numeric_inputs_stay_blank_until_filled(self):
        self.assertIn("setRows([...rows, { ticker: '', value: '' }])", self.src)
        self.assertIn("const parsed = val === '' ? '' : Number(val)", self.src)
        self.assertIn("value={row.value}", self.src)
        self.assertIn("r.value === ''", self.src)

    def test_add_action_is_outside_the_scrollable_rows(self):
        rows_start = self.src.index('className="flex flex-col gap-2 max-h-48 overflow-y-auto')
        rows_end = self.src.index(
            '\n              </div>\n\n              <div className="flex items-center justify-between pt-2">',
            rows_start,
        )
        add_action = self.src.index("Agregar Activo")
        self.assertGreater(add_action, rows_end)


class TestHoldingsDraftSynchronization(unittest.TestCase):
    def setUp(self):
        self.hook = HOLDINGS_HOOK.read_text(encoding="utf-8")
        self.view = HOLDINGS_MODAL.read_text(encoding="utf-8")

    def test_switching_portfolio_rebuilds_draft_and_blocks_incomplete_saves(self):
        self.assertIn("const portfolioChanged = draftPortfolioRef.current !== selectedPf", self.hook)
        self.assertIn("[selectedPf, holdings]", self.hook)
        self.assertIn("draftPortfolioRef.current !== selectedPf", self.hook)
        self.assertIn("missingTickers", self.hook)
        self.assertIn("No se guardó la cartera porque el borrador está incompleto", self.hook)

    def test_table_does_not_hide_assets_missing_from_the_draft(self):
        self.assertIn("holdings.filter((asset: any) => !removedAssetTickers[asset.ticker])", self.view)
        self.assertNotIn("holdings.filter((asset: any) => draftHoldings[asset.ticker] !== undefined)", self.view)
        self.assertIn("Cambiar de cartera los descartará", self.view)

    def test_newly_created_portfolio_is_selected(self):
        self.assertIn("onCreated={(newPfKey)", self.view)
        self.assertIn("const selected = selectPortfolio(newPfKey)", self.view)


if __name__ == "__main__":
    unittest.main()
