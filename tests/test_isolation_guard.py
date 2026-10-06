import pytest

from tests._isolation import PROD_DATA_DIR, ensure_isolated_data_dir


@pytest.mark.parametrize("unsafe_suffix", ["", "nested"])
def test_production_data_override_is_rejected(monkeypatch, unsafe_suffix):
    production = PROD_DATA_DIR / unsafe_suffix
    monkeypatch.setenv("MPFP_DATA_DIR", str(production))
    with pytest.raises(RuntimeError):
        ensure_isolated_data_dir()


def test_symlink_to_production_data_is_rejected(monkeypatch, tmp_path):
    production_alias = tmp_path / "data-link"
    production_alias.symlink_to(PROD_DATA_DIR, target_is_directory=True)
    monkeypatch.setenv("MPFP_DATA_DIR", str(production_alias / "nested"))
    with pytest.raises(RuntimeError):
        ensure_isolated_data_dir()


def test_temporary_override_is_accepted(monkeypatch, tmp_path):
    monkeypatch.setenv("MPFP_DATA_DIR", str(tmp_path / "isolated"))
    target = ensure_isolated_data_dir()
    assert target == (tmp_path / "isolated").resolve()
    assert target.is_dir()
