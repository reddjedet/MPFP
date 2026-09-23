"""
Servicio de Precalentamiento Asíncrono no Bloqueante - MPFP (API-03)
Ejecuta precalentamiento de cotizaciones y métricas de mercado con límites estrictos de tiempo (timeouts)
y cancelación segura sin demorar el arranque ni bloquear endpoints de readiness.
"""

import asyncio
import logging
import os
from typing import Optional, Set

from services.cedear_service import get_multiple_tickers_data
from services.portfolio_service import load_portfolios
from services.tv_service import fetch_performance

logger = logging.getLogger("PrewarmService")

DEFAULT_TIMEOUT_SECONDS = 5.0
BENCHMARK_TICKERS = {"SPY", "QQQ", "DIA"}


async def prewarm_portfolio_cache(timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS) -> bool:
    """
    Precalienta la memoria caché de cotizaciones y rendimiento en segundo plano.
    Aplica timeouts estrictos para garantizar que ninguna lentitud en APIs externas afecte al sistema.
    """
    enable_prewarm = os.getenv("ENABLE_PREWARM", "true").lower() not in ("false", "0", "no")
    if not enable_prewarm:
        logger.info("Precalentamiento de caché desactivado por configuración (ENABLE_PREWARM=false).")
        return False

    try:
        # Pausa breve inicial para permitir que el servidor comience a escuchar conexiones
        await asyncio.sleep(0.5)

        portfolios_data = load_portfolios()
        all_tickers: Set[str] = set()
        for pf in portfolios_data.values():
            if isinstance(pf, dict):
                all_tickers.update(pf.get("assets", {}).keys())

        if not all_tickers:
            logger.info("No hay carteras ni activos registrados para precalentar.")
            return True

        loop = asyncio.get_running_loop()
        ticker_list = sorted(list(all_tickers))
        all_perf_tickers = sorted(list(all_tickers | BENCHMARK_TICKERS))

        logger.info(f"Iniciando precalentamiento asíncrono para {len(ticker_list)} activos...")

        # 1. Cotizaciones y RSI (con timeout específico)
        try:
            await asyncio.wait_for(
                loop.run_in_executor(None, get_multiple_tickers_data, ticker_list),
                timeout=timeout_seconds
            )
            logger.info("✓ Prewarm cotizaciones completado exitosamente.")
        except asyncio.TimeoutError:
            logger.warning(f"Timeout ({timeout_seconds}s) en precalentamiento de cotizaciones; se continúa.")
        except Exception as e:
            logger.warning(f"Aviso en precalentamiento de cotizaciones: {e}")

        # 2. Rendimiento TradingView (con timeout específico)
        try:
            await asyncio.wait_for(
                loop.run_in_executor(None, fetch_performance, all_perf_tickers),
                timeout=timeout_seconds
            )
            logger.info("✓ Prewarm métricas de rendimiento completado exitosamente.")
        except asyncio.TimeoutError:
            logger.warning(f"Timeout ({timeout_seconds}s) en precalentamiento de rendimiento; se continúa.")
        except Exception as e:
            logger.warning(f"Aviso en precalentamiento de rendimiento: {e}")

        logger.info("Precalentamiento finalizado.")
        return True

    except asyncio.CancelledError:
        logger.info("Precalentamiento cancelado limpiamente por apagado del servidor.")
        raise
    except Exception as e:
        logger.error(f"Error imprevisto en precalentamiento: {e}", exc_info=True)
        return False
