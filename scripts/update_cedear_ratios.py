"""
Refresco del catálogo de ratios CEDEAR (`data/cedear_ratios.json`).

Fuente de verdad: la lista oficial de BYMA "CEDEARs Negociables en BYMA"
(PDF publicado en byma.com.ar; la URL se resuelve en runtime porque el CDN
rotaciona el hash). La tabla de Comafi queda como fallback degradado: hoy
esta 182 CEDEARs atrasada y fue la causa de que la app rechazara 161 CEDEARs
validos.

Ningun ratio entra al catálogo sin pasar el control empirico:

    ratio_implicito = (precio_subyacente_USD * FX) / precio_CEDEAR_ARS

que es la misma convencion que usa la app en routers/cedears.py. Los CEDEARs
que no se pueden validar (subyacente en otra moneda, sin precio, emisor sin
cotizacion vigente) se aceptan con el ratio oficial, pero quedan reportados
para revision manual.

Uso:
    ./venv/bin/python scripts/update_cedear_ratios.py            # simulacion
    ./venv/bin/python scripts/update_cedear_ratios.py --apply    # escribe
    ./venv/bin/python scripts/update_cedear_ratios.py --apply --allow-outliers SI
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATIOS_FILE = ROOT / "data" / "cedear_ratios.json"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

BYMA_PAGE = "https://www.byma.com.ar/productos/productos-financieros/cedears"
PPI_URL = "https://www.portfoliopersonal.com/Cotizaciones/Cedears"

# Desvio tolerado entre el ratio oficial y el implicito por precio. El factor
# FX (dolar oficial vs MEP que usa el CEDEAR) se calibra con la mediana de la
# muestra, asi que este umbral mide solo discrepancias reales de ratio.
TOLERANCIA = 0.05

# Minimo de dias en comun entre subyacente, CEDEAR y FX para usar la serie de
# Yahoo como precio local de respaldo cuando el broker no cotiza.
DIAS_MINIMOS_MEDIANA = 5

# Desvio maximo entre el precio local del broker y el de Yahoo .BA antes de
# considerar que una de las dos cotizaciones esta desactualizada.
DESVIO_COTIZACION_LOCAL = 0.15

# Cedears donde el precio NO es comparable al subyacente: los CEDEAR de bonos
# con descuento cotizan al valor de mercado del papel, no a la par, asi que el
# implied se corre siempre aunque el ratio 1:1 sea correcto.
NO_COMPARABLES_POR_PRECIO = {
    "FMCC", "FNMA",
}

# Exentos del control empirico, con el motivo. Se aceptan porque las tres
# fuentes coinciden en el ratio (BYMA + PPI + catalogo vigente) y el desvio
# proviene de la iliquidez local, no de un ratio mal cargado.
RATIO_EXENTOS = {
    "TEN": "serie local inexistente en Yahoo; BYMA y PPI coinciden en 1:1",
    "BIOX": "penny stock sin serie local; BYMA y PPI coinciden en 1:1",
    "SDA": "penny stock sin serie local; BYMA y PPI coinciden en 2:1",
}

# El PDF oficial repite la fila de CIBR con el ticker equivocado: figura
# "First Trust NASDAQ Cybersecurity / XLU / 10:1" cuando el CEDEAR de ese
# ETF es CIBR. El CEDEAR XLU real es el del Utilities Select Sector SPDR
# (15:1), que confirman tanto PPI como el precio de mercado.
RATIO_OVERRIDES = {
    "XLU": (15.0, "PDF oficial duplica la fila de CIBR con ticker XLU; PPI y precio coinciden en 15:1"),
}

# Emisores que BYMA sigue listando pero cuyo subyacente no cotiza mas. Sin
# esto la app resolveria el precio contra otro emisor que reutilizo el ticker
# (Silvergate quebró en 2023 y NYSE le devolvio el ticker SI a Sila Realty).
EXCLUDE = {
    "SI": "Silvergate Bancorp quebró en 2023; el ticker NYSE hoy es otra empresa",
}

# Subyacente en US cuando el ticker del CEDEAR no coincide con el de la accion.
US_ALIAS = {
    "BA.C": "BAC",
    "DISN": "DIS",
    "BRKB": "BRK-B",
    "HNP": "YPF",
    "HNPIY": "HNP",
    "NEC1": "NOK",
    "NOKA": "NOK",
    "TX": "TNX",
    "TSU": "TNX",
    "GLNT": "GOOGL",
}

# Mercados con subyacente en USD: unico caso donde comparar precios tiene
# sentido. En XETRA/LSE/B3 el precio viene en otra moneda.
USD_MARKETS = {
    "NASDAQ", "NASDAQ GS", "NASDAQ GM", "NYSE", "NYSE ARCA", "NYSE AMERICAN",
    "NYSE MKT", "OTC", "OTC US", "OTCQB", "ARCA", "BATS", "CBOE",
}

# Cedears sin subyacente US comparable (B3, emisores locales, FCI). El ratio
# 1:1 es legitimo y no hay contra que validarlo.
NO_US_CHECK = {
    "ABEV3", "BBDC3", "BBAS3", "CSNA3", "HAPV3", "ITUB3", "LREN3", "NATU3",
    "PETR3", "PRIO3", "RENT3", "SUZB3", "TIMS3", "VALE3", "VIVT3", "WEGE3",
    "JBSS3", "BPAC", "BBAR", "AMX", "IMPSA", "PAMP", "CABLE", "CVSAD",
    "TGLS", "LOMA", "CYC", "HARG", "PFFD", "GGAL",
}


def _get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ── BYMA: fuente de verdad ───────────────────────────────────────────────────

def resolve_byma_pdf_url() -> str:
    """El PDF vive en un CDN con hash rotativo: hay que resolverlo cada vez."""
    page = _get(BYMA_PAGE).decode("utf-8", "ignore")
    for url in re.findall(r'href="([^"]+\.pdf)"', page, re.I):
        if "cedear" in url.lower():
            return url if url.startswith("http") else "https://www.byma.com.ar" + url
    raise RuntimeError("BYMA no publico ningun PDF de CEDEARs en su pagina")


def fetch_byma() -> dict[str, dict]:
    url = resolve_byma_pdf_url()
    raw = _get(url)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
        tmp.write(raw)
        tmp.flush()
        text = subprocess.run(
            ["pdftotext", "-layout", tmp.name, "-"],
            capture_output=True, text=True, check=True,
        ).stdout

    cols = re.compile(r"\s{2,}")
    ratio_re = re.compile(r"(\d+)\s*:\s*(\d+)")
    ticker_re = re.compile(r"[A-Z0-9][A-Z0-9\.\-]{0,7}")
    # Un nombre de bolsa encaja en el patron de ticker, asi que hay que
    # reconocerlo antes de Rearmar las filas sin nombre.
    market_words = {
        "NYSE", "NASDAQ", "XETRA", "AMEX", "ARCA", "BATS", "CBOE", "OTC",
        "OTC US", "B3", "LSE", "TSX", "SIX", "EURONEXT", "TASE", "HKEX",
        "ASX", "JPX", "KRX", "SGX", "TAL", "BMV", "MIL", "ETR",
    }
    out: dict[str, dict] = {}
    collisions: list[str] = []

    for line in text.splitlines():
        parts = [p for p in cols.split(line.strip()) if p]
        if len(parts) < 3:
            continue

        # El PDF no siempre imprime todas las columnas: hay filas sin mercado
        # (emisiones que cotizan en bolsas del exterior) y al menos una sin
        # nombre. Se rearman segun donde caiga el ratio.
        name = market = ""
        if len(parts) >= 4:
            name, ticker, market, ratio = parts[0], parts[1], parts[2], parts[3]
        elif ratio_re.fullmatch(parts[-1]):
            if parts[1].upper() in market_words:
                ticker, market, ratio = parts[0], parts[1], parts[2]
            elif ticker_re.fullmatch(parts[1]):
                name, ticker, ratio = parts[0], parts[1], parts[2]
            else:
                ticker, market, ratio = parts[0], parts[1], parts[2]
        else:
            continue

        m = ratio_re.fullmatch(ratio)
        if not m or not ticker_re.fullmatch(ticker):
            continue
        num, den = int(m.group(1)), int(m.group(2))
        if not den:
            continue
        if ticker in out:
            collisions.append(ticker)
            continue
        out[ticker] = {
            "nombre": name.strip(),
            "mercado": market.strip(),
            "ratio": num / den,
            "ratio_txt": f"{num}:{den}",
        }
    return out, collisions, url


# ── PPI: segundo piso para contrastar ────────────────────────────────────────

def fetch_ppi() -> dict[str, dict]:
    """Feed live del broker: ticker, precio ARS y ratio declarado.

    PPI usa ratio=1 como "no informado" en ~66 CEDEARs, asi que sirve para
    detectar placeholders, no como fuente de verdad.
    """
    html = _get(PPI_URL).decode("utf-8", "ignore")
    out: dict[str, dict] = {}
    for m in re.finditer(
        r'\{"item":\d+,"ticker":"([^"]*)","description":"([^"]*)","lastPrice":([\d\.]+)',
        html,
    ):
        tail = html[m.start(): m.start() + 700]
        rm = re.search(r'"ratio":([\d\.]+)', tail)
        if rm:
            out[m.group(1)] = {
                "desc": m.group(2),
                "precio": float(m.group(3)),
                "ratio": float(rm.group(1)),
            }
    return out


# ── Precios ──────────────────────────────────────────────────────────────────

def yahoo_prices(symbols: list[str]) -> dict[str, float]:
    """Ultimo cierre de cada simbolo. Batch de 20, sin crumb ni API key."""
    prices: dict[str, float] = {}
    for i in range(0, len(symbols), 20):
        chunk = symbols[i: i + 20]
        url = (
            "https://query1.finance.yahoo.com/v7/finance/spark?symbols="
            + ",".join(urllib.parse.quote(s) for s in chunk)
            + "&range=5d&interval=1d"
        )
        try:
            data = json.loads(_get(url))
        except Exception as exc:  # noqa: BLE001
            print(f"  [warn] batch {i}: {exc}", file=sys.stderr)
            continue
        for row in data.get("spark", {}).get("result", []) or []:
            closes = (
                (row.get("response") or [{}])[0].get("indicators", {})
                .get("quote", [{}])[0].get("close", [])
            )
            closes = [c for c in closes if c is not None]
            if closes:
                prices[row["symbol"]] = closes[-1]
    return prices


def yahoo_series(symbol: str, months: int = 3) -> dict[str, float]:
    """Cierres diarios por fecha ISO."""
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(symbol)}?range={months}mo&interval=1d"
    )
    try:
        res = json.loads(_get(url))["chart"]["result"][0]
    except Exception:  # noqa: BLE001
        return {}
    stamps = res.get("timestamp") or []
    closes = (res.get("indicators", {}).get("quote", [{}])[0].get("close")) or []
    out = {}
    for i, stamp in enumerate(stamps):
        value = closes[i] if i < len(closes) else None
        if value is not None:
            out[datetime.fromtimestamp(stamp, timezone.utc).date().isoformat()] = value
    return out


_SERIES_CACHE: dict[str, dict[str, float]] = {}
_FX_SERIES: dict[str, float] | None = None


def fx_series() -> dict[str, float]:
    """Serie del dolar una sola vez: se comparte entre todos los tickers."""
    global _FX_SERIES
    if _FX_SERIES is None:
        _FX_SERIES = yahoo_series("ARS=X")
    return _FX_SERIES


def implied_series(cedear: str, us_symbol: str) -> dict[str, float]:
    """Ratio implicito dia a dia entre subyacente, CEDEAR local y dolar.

    Solo devuelve los dias en comun: comparar contra el ultimo precio de cada
    lado mezcla fechas distintas y falsea el resultado.
    """
    key = f"{us_symbol}|{cedear}"
    if key in _SERIES_CACHE:
        return _SERIES_CACHE[key]

    us = yahoo_series(us_symbol)
    ba = yahoo_series(f"{cedear}.BA")
    fx = fx_series()
    out = {}
    for day, us_price in us.items():
        if day in ba and day in fx and ba[day] > 0:
            out[day] = us_price * fx[day] / ba[day]
    _SERIES_CACHE[key] = out
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="escribe el catalogo")
    args = ap.parse_args()

    print("BYMA (PDF oficial)...", flush=True)
    byma, collisions, url = fetch_byma()
    print(f"  {len(byma)} CEDEARs | {url}")
    if collisions:
        print(f"  colisiones de ticker en el PDF: {sorted(set(collisions))}")

    print("PPI (feed live)...", flush=True)
    ppi = fetch_ppi()
    print(f"  {len(ppi)} CEDEARs")

    print("Precios...", flush=True)
    us_map = {
        tk: US_ALIAS.get(tk, tk)
        for tk in byma
        if tk not in NO_US_CHECK and tk not in EXCLUDE
        and byma[tk]["mercado"].upper() in USD_MARKETS
    }
    px = yahoo_prices(sorted(set(us_map.values()) | {"ARS=X"}
                             | {f"{tk}.BA" for tk in byma if tk not in EXCLUDE}))
    fx = px.get("ARS=X")
    if not fx:
        print("ERROR: sin precio de FX, no se puede validar", file=sys.stderr)
        return 1
    print(f"  {len(px)} simbolos | FX={fx}")

    # Ratio final por ticker: oficial BYMA, con overrides documentados.
    final: dict[str, float] = {}
    for tk, row in byma.items():
        if tk in EXCLUDE:
            continue
        final[tk] = RATIO_OVERRIDES[tk][0] if tk in RATIO_OVERRIDES else row["ratio"]

    # Calibracion del factor FX con la mediana de los casos validables.
    factors = []
    for tk, ratio in final.items():
        us_px = px.get(us_map.get(tk, ""))
        ba = ppi.get(tk)
        if us_px and ba and ba["precio"] > 0 and ratio:
            f = (us_px * fx / ba["precio"]) / ratio
            if 0.3 < f < 3:
                factors.append(f)
    factor = statistics.median(factors)
    print(f"  factor FX (mediana de {len(factors)} casos): {factor:.4f}")

    outliers, unvalidated, mismatches, cotizacion_local = [], [], [], []
    validados = 0
    for tk, ratio in sorted(final.items()):
        if tk in NO_COMPARABLES_POR_PRECIO:
            unvalidated.append(tk)
            continue
        us_px = px.get(us_map.get(tk, ""))
        ba = ppi.get(tk)
        yahoo_ba = px.get(f"{tk}.BA")

        # Diagnostico de calidad: si el broker y Yahoo .BA discrepan fuerte,
        # una de las dos cotizaciones locales esta desactualizada. No bloquea
        # (el ratio oficial manda) pero se reporta porque afecta la valuacion.
        if ba and yahoo_ba and ba["precio"] > 0:
            drift = abs(ba["precio"] - yahoo_ba) / ba["precio"]
            if drift > DESVIO_COTIZACION_LOCAL:
                cotizacion_local.append((tk, ba["precio"], yahoo_ba, drift))

        # Precio local: el broker cotiza la rueda al dia; la serie .BA de
        # Yahoo queda desactualizada en varios CEDEARs liquids (DISN, UL...).
        implied, metodo = None, ""
        if us_px and ba and ba["precio"] > 0:
            implied, metodo = us_px * fx / ba["precio"], "broker"
        elif ba is not None and ba["precio"] <= 0:
            # El broker conoce el CEDEAR pero no registro operaciones: no hay
            # precio local real. No se cae a la serie de Yahoo porque mediria
            # un residuo de cotizacion vieja, no el precio vigente.
            implied = None
        elif tk in us_map:
            serie = implied_series(tk, us_map[tk])
            if len(serie) >= DIAS_MINIMOS_MEDIANA:
                implied, metodo = statistics.median(serie.values()), "mediana"
        elif us_px and yahoo_ba and yahoo_ba > 0:
            implied, metodo = us_px * fx / yahoo_ba, "yahoo"

        if implied is None:
            unvalidated.append(tk)
            continue
        validados += 1

        dev = implied / (ratio * factor) - 1
        if abs(dev) > TOLERANCIA:
            outliers.append((tk, ratio, implied, dev, byma[tk]["nombre"], metodo))
        if ba and ba["ratio"] not in (ratio,) and not (ba["ratio"] == 1 and ratio != 1):
            mismatches.append((tk, ba["ratio"], ratio))

    print(f"\nControl empirico: {validados} validados, "
          f"{len(unvalidated)} sin precio comparable, {len(outliers)} outliers")
    for tk, ratio, implied, dev, name, metodo in outliers:
        exempt = RATIO_EXENTOS.get(tk)
        mark = f"  [exento: {exempt}]" if exempt else "  [BLOQUEANTE]"
        print(f"  {tk:6s} oficial={ratio:<8g} implicito={implied:>9.2f} "
              f"{dev:+.1%} ({metodo})  {name[:34]}{mark}")
    if mismatches:
        print(f"\nPPI difiere del oficial ({len(mismatches)}): "
              f"{', '.join(f'{t}:{p:g} vs {o:g}' for t, p, o in mismatches[:12])}")
    if cotizacion_local:
        print(f"\nCotizacion local divergente broker vs Yahoo .BA "
              f"({len(cotizacion_local)}):")
        for tk, ppi_px, yf_px, drift in cotizacion_local[:10]:
            print(f"  {tk:6s} broker={ppi_px:>12,.2f} yahoo={yf_px:>12,.2f} {drift:+.0%}")

    blocking = [o for o in outliers if o[0] not in RATIO_EXENTOS]
    if blocking:
        print(
            "\nABORTADO: hay outliers sin excepcion documentada en "
            "RATIO_EXENTOS. No se escribe el catalogo.",
            file=sys.stderr,
        )
        return 1
    for tk, why in RATIO_EXENTOS.items():
        if tk in final:
            print(f"Exento {tk}: {why}")

    for tk, why in EXCLUDE.items():
        if tk in byma:
            print(f"Excluido {tk}: {why}")

    payload = json.dumps(dict(sorted(final.items())), indent=1) + "\n"
    if not args.apply:
        actual = RATIOS_FILE.read_text(encoding="utf-8") if RATIOS_FILE.exists() else ""
        print(f"\nSimulacion: {len(final)} ratios. "
              f"Catalogo actual: {len(json.loads(actual)) if actual else 0}.")
        if payload != actual:
            print("  (el catalogo cambiaria; ejecutar con --apply)")
        return 0

    # Escritura atomica POSIX: el seed versionado nunca queda a medio escribir.
    tmp = RATIOS_FILE.with_suffix(".json.tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, RATIOS_FILE)
    print(f"\nEscrito {RATIOS_FILE.relative_to(ROOT)} con {len(final)} ratios.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())