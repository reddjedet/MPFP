import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, Loader2 } from 'lucide-react';
import { calculateBuyerAllocation } from './buyerAllocationMath';

type Quote = { symbol: string; local?: number | string | null };
type Holding = { nominals?: number } | number;
type Props = {
  selectedPf: string;
  portfolio?: { assets?: Record<string, number | string> };
  quotes: Quote[];
};

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function BuyerAllocationCalculator({ selectedPf, portfolio, quotes }: Props) {
  const [capital, setCapital] = useState('');
  const [holdings, setHoldings] = useState<Record<string, Holding> | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!selectedPf) {
      setHoldings(null);
      setStatus('error');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setHoldings(null);

    fetch(`/api/rotation/holdings?portfolio=${encodeURIComponent(selectedPf)}`, {
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error('No se pudieron consultar las tenencias.');
        return response.json();
      })
      .then(data => {
        if (!data.holdings || typeof data.holdings !== 'object' || Array.isArray(data.holdings)) {
          throw new Error('La respuesta de tenencias no es válida.');
        }
        setHoldings(data.holdings as Record<string, Holding>);
        setStatus('idle');
      })
      .catch(error => {
        if (error.name !== 'AbortError') setStatus('error');
      });

    return () => controller.abort();
  }, [selectedPf]);

  const targetAssets = useMemo(() => Object.entries(portfolio?.assets || {})
    .map(([ticker, rawWeight]) => ({ ticker, targetWeight: Number(rawWeight) }))
    .filter(asset => Number.isFinite(asset.targetWeight) && asset.targetWeight > 0), [portfolio]);

  const quoteByTicker = useMemo(() => new Map(quotes.map(quote => [quote.symbol, quote])), [quotes]);
  const assets = targetAssets.map(asset => {
    const quote = quoteByTicker.get(asset.ticker);
    const rawPrice = Number(quote?.local);
    const holding = holdings?.[asset.ticker];
    const rawUnits = typeof holding === 'number' ? holding : Number(holding?.nominals);

    return {
      ...asset,
      price: Number.isFinite(rawPrice) ? rawPrice : 0,
      currentUnits: Number.isFinite(rawUnits) ? Math.max(0, rawUnits) : 0,
    };
  });

  // Solo se admiten pesos enteros en ARS para evitar ambigüedades con separadores locales.
  const amount = Number(capital);
  const validAmount = Number.isSafeInteger(amount) && amount > 0;
  const missingPrice = assets.some(asset => !(asset.price > 0));
  const allocation = validAmount && !missingPrice
    ? calculateBuyerAllocation(assets, amount)
    : null;

  return (
    <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-positive" />
        <h2 className="text-lg font-bold text-foreground">Calculadora informativa de asignación</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Distribuye el importe para acercar las tenencias a los pesos del portfolio objetivo. Solo considera sus CEDEARs y no depende del RSI.
      </p>

      <label className="block text-sm text-foreground mb-4">
        Capital nuevo (ARS)
        <input
          type="text"
          inputMode="numeric"
          value={capital}
          onChange={event => setCapital(event.target.value.replace(/\D/g, ''))}
          placeholder="Ej. 100000"
          aria-label="Capital nuevo en pesos argentinos"
          className="mt-1 w-full sm:max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>

      <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
        Simulación informativa; no ejecuta ni guarda operaciones. Los precios pueden variar.
      </p>

      {status === 'loading' && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />Consultando tenencias actuales...
        </p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />No se pudieron leer las tenencias; no se generará una recomendación.
        </p>
      )}
      {status === 'idle' && holdings && targetAssets.length === 0 && (
        <p className="text-sm text-muted-foreground">El portfolio objetivo no tiene CEDEARs con pesos positivos para calcular.</p>
      )}
      {status === 'idle' && holdings && targetAssets.length > 0 && !validAmount && (
        <p className="text-sm text-muted-foreground">Ingresá un importe entero mayor a cero.</p>
      )}
      {status === 'idle' && holdings && targetAssets.length > 0 && validAmount && missingPrice && (
        <p className="text-sm text-amber-300">Falta una cotización local positiva para un CEDEAR objetivo; se evita una recomendación incompleta.</p>
      )}

      {status === 'idle' && holdings && allocation && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[680px]">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-border">
                  <th className="py-2">Ticker</th>
                  <th>Peso obj.</th>
                  <th>Unid. actuales</th>
                  <th>Precio local</th>
                  <th>Unid. sugeridas</th>
                  <th>Compra estimada</th>
                  <th>Peso post*</th>
                </tr>
              </thead>
              <tbody>
                {allocation.rows.map(row => (
                  <tr key={row.ticker} className="border-b border-border/60 text-foreground">
                    <td className="py-2 font-bold">{row.ticker}</td>
                    <td>{(row.target * 100).toFixed(1)}%</td>
                    <td>{row.currentUnits}</td>
                    <td>{currency.format(row.price)}</td>
                    <td>{row.suggested}</td>
                    <td>{currency.format(row.purchase)}</td>
                    <td>{allocation.postTotal > 0 ? (((row.currentValue + row.purchase) / allocation.postTotal) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
            <span>Total recomendado: <b>{currency.format(allocation.spent)}</b></span>
            <span>Remanente: <b>{currency.format(allocation.remaining)}</b></span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            * Pesos sobre valores de CEDEARs post-compra; no incluye efectivo sobrante.
          </p>
        </>
      )}
    </section>
  );
}
