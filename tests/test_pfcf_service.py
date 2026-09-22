import unittest
import tempfile
from pathlib import Path

from services.pfcf_service import (
    get_pfcf_value,
    save_pfcf_value,
    save_bulk_pfcf_values,
    parse_pfcf_input,
    evaluate_fcf_rsi_state,
    _db
)


class TestPfcfService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        initial_data = dict(_db.load() if isinstance(_db.load(), dict) else {})
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls._orig_path = _db.file_path
        _db.file_path = Path(cls._tmp_dir.name) / "pfcf_values.json"
        _db._cache = None
        _db._cache_valid = False
        _db.save(initial_data)

    @classmethod
    def tearDownClass(cls):
        _db.file_path = cls._orig_path
        _db._cache = None
        _db._cache_valid = False
        cls._tmp_dir.cleanup()

    def test_parse_pfcf_input(self):

        self.assertEqual(parse_pfcf_input('17.35'), 17.35)
        self.assertEqual(parse_pfcf_input('17,35'), 17.35)
        self.assertEqual(parse_pfcf_input(21.07), 21.07)
        self.assertEqual(parse_pfcf_input(18), 18.0)
        self.assertIsNone(parse_pfcf_input(''))
        self.assertIsNone(parse_pfcf_input('—'))
        self.assertIsNone(parse_pfcf_input(None))
        self.assertIsNone(parse_pfcf_input('-5'))
        self.assertIsNone(parse_pfcf_input('abc'))

    def test_pfcf_persistence(self):
        save_pfcf_value('TESTTK', '17.35')
        self.assertEqual(get_pfcf_value('TESTTK'), 17.35)
        
        # Test bulk
        save_bulk_pfcf_values({'TESTA': '21.07', 'TESTB': '32.87'})
        self.assertEqual(get_pfcf_value('TESTA'), 21.07)
        self.assertEqual(get_pfcf_value('TESTB'), 32.87)

        # Cleanup
        save_pfcf_value('TESTTK', '')
        save_pfcf_value('TESTA', '')
        save_pfcf_value('TESTB', '')
        self.assertIsNone(get_pfcf_value('TESTTK'))
        self.assertIsNone(get_pfcf_value('TESTA'))
        self.assertIsNone(get_pfcf_value('TESTB'))

    def test_evaluate_fcf_rsi_state_sobreventa(self):
        # 1. Ganga + Sobreventa (<= 18 and < 35) -> Compra Fuerte
        res1 = evaluate_fcf_rsi_state('META', pfcf_val=17.35, rsi_val=28.5)
        self.assertIsNotNone(res1)
        self.assertEqual(res1['state_key'], 'optimo')
        self.assertIn('COMPRA FUERTE', res1['badge_text'])
        self.assertEqual(res1['tooltip'], 'P/FCF Normalizado: 17.35 | RSI: 28.5')

        # 2. Subvaluado + Sobreventa (<= 24 and < 35) -> Compra Óptima
        res2 = evaluate_fcf_rsi_state('MSFT', pfcf_val=21.07, rsi_val=34.0)
        self.assertIsNotNone(res2)
        self.assertEqual(res2['state_key'], 'optimo')
        self.assertIn('COMPRA ÓPTIMA', res2['badge_text'])
        self.assertEqual(res2['tooltip'], 'P/FCF Normalizado: 21.07 | RSI: 34.0')

        # 3. Valuación Justa + Sobreventa (24 < P/FCF <= 32 and < 35) -> Compra Táctica
        res3 = evaluate_fcf_rsi_state('MA', pfcf_val=29.34, rsi_val=32.0)
        self.assertIsNotNone(res3)
        self.assertEqual(res3['state_key'], 'sub_optimo')
        self.assertIn('COMPRA TÁCTICA', res3['badge_text'])
        self.assertEqual(res3['tooltip'], 'P/FCF Normalizado: 29.34 | RSI: 32.0')

        # 4. Sobrevaluado + Sobreventa (P/FCF > 32 and < 35) -> No Comprar (Trampa de Valor)
        res4 = evaluate_fcf_rsi_state('AMAT', pfcf_val=45.0, rsi_val=31.0)
        self.assertIsNotNone(res4)
        self.assertEqual(res4['state_key'], 'no_comprar')
        self.assertIn('NO COMPRAR', res4['badge_text'])
        self.assertEqual(res4['tooltip'], 'P/FCF Normalizado: 45.00 | RSI: 31.0')

        # 5. Sin P/FCF + Sobreventa (< 35) -> Sobreventa alerta
        res5 = evaluate_fcf_rsi_state('UNKNOWN', pfcf_val=None, rsi_val=30.0)
        self.assertIsNotNone(res5)
        self.assertEqual(res5['state_key'], 'sobreventa_alerta')
        self.assertIn('SOBREVENTA', res5['badge_text'])
        self.assertEqual(res5['tooltip'], 'P/FCF Normalizado: N/D | RSI: 30.0')

    def test_evaluate_fcf_rsi_state_sobrecompra(self):
        # 1. Sobrevaluado + Sobrecompra (P/FCF > 32 and > 65) -> Tomar Ganancias
        res1 = evaluate_fcf_rsi_state('AMAT', pfcf_val=59.40, rsi_val=72.0)
        self.assertIsNotNone(res1)
        self.assertEqual(res1['state_key'], 'no_comprar')
        self.assertIn('TOMAR GANANCIAS', res1['badge_text'])
        self.assertEqual(res1['tooltip'], 'P/FCF Normalizado: 59.40 | RSI: 72.0')

        # 2. Valuación Completa + Sobrecompra (24 < P/FCF <= 32 and > 65) -> Sobrecompra / Esperar
        res2 = evaluate_fcf_rsi_state('V', pfcf_val=28.5, rsi_val=68.0)
        self.assertIsNotNone(res2)
        self.assertEqual(res2['state_key'], 'no_comprar')
        self.assertIn('SOBRECOMPRA', res2['badge_text'])
        self.assertEqual(res2['tooltip'], 'P/FCF Normalizado: 28.50 | RSI: 68.0')

        # 3. Subvaluado + Sobrecompra (P/FCF <= 24 and > 65) -> Hold / Mantener
        res3 = evaluate_fcf_rsi_state('META', pfcf_val=17.35, rsi_val=70.0)
        self.assertIsNotNone(res3)
        self.assertEqual(res3['state_key'], 'hold')
        self.assertIn('MANTENER', res3['badge_text'])
        self.assertEqual(res3['tooltip'], 'P/FCF Normalizado: 17.35 | RSI: 70.0')

        # 4. Sin P/FCF + Sobrecompra (> 65) -> Sobrecompra
        res4 = evaluate_fcf_rsi_state('UNKNOWN', pfcf_val=None, rsi_val=75.0)
        self.assertIsNotNone(res4)
        self.assertEqual(res4['state_key'], 'no_comprar')
        self.assertIn('SOBRECOMPRA', res4['badge_text'])
        self.assertEqual(res4['tooltip'], 'P/FCF Normalizado: N/D | RSI: 75.0')

    def test_evaluate_fcf_rsi_state_neutral(self):
        # Zona Neutral: 35 <= RSI <= 65 -> Debe retornar None (sin alertas activas)
        self.assertIsNone(evaluate_fcf_rsi_state('AAPL', pfcf_val=17.35, rsi_val=35.0))
        self.assertIsNone(evaluate_fcf_rsi_state('MSFT', pfcf_val=21.07, rsi_val=50.0))
        self.assertIsNone(evaluate_fcf_rsi_state('GOOGL', pfcf_val=28.00, rsi_val=65.0))
        self.assertIsNone(evaluate_fcf_rsi_state('COST', pfcf_val=48.00, rsi_val=55.0))


if __name__ == '__main__':
    unittest.main()
