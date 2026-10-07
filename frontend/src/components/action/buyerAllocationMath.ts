export type AllocationAsset = {
  ticker: string;
  targetWeight: number;
  currentUnits: number;
  price: number;
};

export type AllocationRow = AllocationAsset & {
  target: number;
  currentValue: number;
  suggested: number;
  purchase: number;
};

export type AllocationResult = {
  rows: AllocationRow[];
  spent: number;
  remaining: number;
  postTotal: number;
};

/** Distribuye capital nuevo entre posiciones por debajo de su peso objetivo. */
export function calculateBuyerAllocation(
  assets: AllocationAsset[],
  capital: number,
): AllocationResult {
  const safeCapital = Number.isFinite(capital) && capital > 0 ? capital : 0;
  const validAssets = assets.filter(asset =>
    Number.isFinite(asset.targetWeight) && asset.targetWeight > 0 &&
    Number.isFinite(asset.currentUnits) && asset.currentUnits >= 0 &&
    Number.isFinite(asset.price) && asset.price > 0,
  );
  const weightTotal = validAssets.reduce((sum, asset) => sum + asset.targetWeight, 0);

  if (safeCapital <= 0 || weightTotal <= 0) {
    return { rows: [], spent: 0, remaining: safeCapital, postTotal: 0 };
  }

  const rows: AllocationRow[] = validAssets.map(asset => ({
    ...asset,
    target: asset.targetWeight / weightTotal,
    currentValue: asset.currentUnits * asset.price,
    suggested: 0,
    purchase: 0,
  }));
  const currentTotal = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const targetTotal = currentTotal + safeCapital;
  const gaps = rows.map(row => Math.max(0, row.target * targetTotal - row.currentValue));
  const gapTotal = gaps.reduce((sum, gap) => sum + gap, 0);
  const allocations = rows.map((row, index) =>
    safeCapital * (gapTotal > 0 ? gaps[index] / gapTotal : row.target),
  );

  rows.forEach((row, index) => {
    row.suggested = Math.floor(allocations[index] / row.price);
    row.purchase = row.suggested * row.price;
  });

  let spent = rows.reduce((sum, row) => sum + row.purchase, 0);
  let remaining = Math.max(0, safeCapital - spent);

  // Use affordable whole units left by rounding when they further close a target gap.
  // The cap keeps unusual price scales from causing a long synchronous loop.
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    let bestIndex = -1;
    let bestImprovementPerPeso = 0;

    rows.forEach((row, index) => {
      if (row.price > remaining) return;
      const desiredValue = row.target * targetTotal;
      const currentProjectedValue = row.currentValue + row.purchase;
      const gap = desiredValue - currentProjectedValue;
      const improvementPerPeso = 2 * gap - row.price;
      if (improvementPerPeso > bestImprovementPerPeso) {
        bestImprovementPerPeso = improvementPerPeso;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) break;
    const row = rows[bestIndex];
    row.suggested += 1;
    row.purchase += row.price;
    spent += row.price;
    remaining = Math.max(0, safeCapital - spent);
  }

  return {
    rows,
    spent,
    remaining,
    postTotal: currentTotal + spent,
  };
}
