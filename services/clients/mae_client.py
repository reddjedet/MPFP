"""
MAE.com.ar Data Fetcher — Mercado Abierto Electronico de Argentina.

API publica de market data del MAE (https://www.mae.com.ar). Sin API key,
sin autenticacion. Todos los datos son delayed (cierre del dia anterior
o tiempo real con delay de mercado).

Endpoints disponibles:

  RESUMENES (intraday + historial intradia del titulo lider):
    - resumen RF       Top 10 titulos publicos renta fija (LECAPs, BONCAPs, etc.)
    - resumen CAU      Top cauciones (CAARS, CAUSD por plazo)
    - resumen FOR      Top monedas FOREX (US$, EUR, etc.)
    - resumen DDF      Top contratos futuro dolar (Dolar Diferido a Fix)

  DATOS DE MERCADO (todos los titulos negociados hoy):
    - datos RF         Todas las cotizaciones del dia de renta fija (~289 lineas)
    - datos CAU        Todas las cauciones del dia
    - datos FOR        Todas las cotizaciones FOREX

  VOLUMEN:
    - volumen ARS      Volumen por categoria (Renta Fija TRD, FOREX, etc.) en pesos
    - volumen USD      Mismo en dolares

  MAPA (prospectos por segmento/plazo/moneda):
    - mapa             Mapa de titulos por segmento, plazo y moneda

  INSTITUCIONAL:
    - comunicados      Comunicados del MAE
    - licitaciones     Calendario de licitaciones (proximas + actuales)
    - licitaciones-estado  Licitaciones filtradas por estado (A/F/C/S/P)

  CURVAS RENTA FIJA:
    - flujo-fondos H   Flujo fondos cotizaciones bonos hard dollar (AE38, AL30, etc.)
    - flujo-fondos B   Flujo fondos cotizaciones BOPREALes

  HISTORICOS:
    - hist-rf          Historico renta fija por rango de fechas (grid + chart)
    - hist-forex       Historico FOREX por rango de fechas
    - hist-forex-vol   Historico volumen operado FOREX
    - hist-cau         Historico cauciones por rango
    - hist-cau-vt      Cauciones: serie de volumen y tasas por titulo+plazo
    - hist-repo        Historico repo por rango
    - repo-fecha       Volumen repo y tasa promedio ponderada por fecha

  INDICES:
    - indice-ars       Indice ARS-MAE actual (PBO + PPN intradia)
    - indice-ars-hist  Serie historica del Indice ARS-MAE (PPN diario)

Uso:
    py fetch_mae.py resumen RF
    py fetch_mae.py resumen CAU
    py fetch_mae.py resumen FOR
    py fetch_mae.py resumen DDF
    py fetch_mae.py datos RF
    py fetch_mae.py datos CAU
    py fetch_mae.py datos FOR
    py fetch_mae.py volumen ARS
    py fetch_mae.py volumen USD
    py fetch_mae.py mapa --segmento BT --plazo 001 --moneda '$'
    py fetch_mae.py comunicados
    py fetch_mae.py comunicados --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py licitaciones
    py fetch_mae.py licitaciones-estado --estado A --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py flujo-fondos H
    py fetch_mae.py flujo-fondos B
    py fetch_mae.py hist-rf --desde 2026-05-05 --hasta 2026-06-04
    py fetch_mae.py hist-forex --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py hist-forex-vol --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py hist-cau --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py hist-cau-vt --titulo CAARS --plazo 001 --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py hist-repo --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py repo-fecha --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py indice-ars
    py fetch_mae.py indice-ars-hist --desde 2026-05-05 --hasta 2026-06-05
    py fetch_mae.py all
"""
from __future__ import annotations
import argparse
import json
import logging
import sys
import time
import urllib.parse
from datetime import datetime
from typing import Any
import requests
log = logging.getLogger('mae')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S')
BASE = 'https://api.marketdata.mae.com.ar/api'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'application/json'}
RESUMEN_TIPOS = ['RF', 'CAU', 'FOR', 'DDF']
DATOS_TIPOS = ['RF', 'CAU', 'FOR']
VOLUMEN_MONEDAS = ['ARS', 'USD']
FLUJO_FONDOS_LETRAS = ['B', 'H']
LICITACION_ESTADOS = {'A': 'Activa', 'F': 'Finalizada', 'C': 'Cancelada', 'S': 'Suspendida', 'P': 'Programada'}
MAPA_SEGMENTOS = ['BT', 'PPT', 'PT', 'BL', 'TX', 'RV', 'EX']
MAPA_MONEDAS = ['$', 'D', 'C']

def _get(url: str, params: dict | None=None) -> Any:
    """GET request con error handling."""
    r = requests.get(url, headers=HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def _build_otitulo(d: dict) -> str:
    """Codifica un dict como query param `oTitulo=` en JSON URL-encoded."""
    return urllib.parse.quote(json.dumps(d, separators=(',', ':')))

def fetch_datos(tipo: str) -> list:
    """Datos completos de mercado del dia para una categoria.

    Devuelve TODAS las cotizaciones de la rueda (no solo el top 10 como
    `resumen`). Para RF puede devolver ~289 lineas (cada titulo x plazo x moneda).

    Args:
        tipo: RF (renta fija), CAU (cauciones), FOR (forex).
              DDF no esta soportado (retorna 500).

    Returns:
        list de dicts con keys: ticker, tipoEmision, fechaLiquidacion,
        volumen, monto, descripcion, plazo, codigoPlazo, segmento, codigoSegmento,
        moneda, variacion, ultimo, ultimaTasa, cierreAnterior, minimo, maximo,
        openInterest, precioCierre, precioApertura.
    """
    if tipo not in DATOS_TIPOS:
        raise ValueError(f'Tipo invalido. Validos: {DATOS_TIPOS}')
    return _get(f'{BASE}/mercado/datos/{tipo}')

def fetch_flujo_fondos(letra: str) -> list:
    """Flujo de fondos teorico de bonos cotizantes para construir curva TIR/MD.

    Devuelve, para cada bono de la letra, su precio actual, TIR, MD y
    el flujo de fondos completo (cashflow, renta, amortizacion por fecha).

    Args:
        letra: B (BOPREAL serie 1: BPOB7, BPOD7, BPOC7), H (bonos hard dollar
               step-up: AE38, etc.). Otras letras retornan lista vacia.

    Returns:
        list de dicts con keys: especie, numeroCuponActual, renta, amortizacion,
        amasR, moneda, descripcion, precio, tir, md, detalle[].
        `detalle` es la lista de cashflows futuros: fechaPago, vr, vrCartera,
        cashFlow, renta, amortizacion, amasR.
    """
    return _get(f'{BASE}/emisiones/flujofondoscotiz/{letra}')
MODES = ['resumen', 'datos', 'volumen', 'mapa', 'comunicados', 'licitaciones', 'licitaciones-estado', 'flujo-fondos', 'hist-rf', 'hist-forex', 'hist-forex-vol', 'hist-cau', 'hist-cau-vt', 'hist-repo', 'repo-fecha', 'indice-ars', 'indice-ars-hist', 'all']
if __name__ == '__main__':
    main()