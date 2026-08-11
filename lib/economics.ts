import type {
  ConfidenceLevel,
  DataIssue,
  DemandProjectionInput,
  ElasticityEstimate,
  ObservationValidationResult,
  PriceFrontier,
  PriceFrontierInput,
  PriceFrontierPoint,
  PricingMetrics,
  PricingObservation,
  PricingScenario,
  RiskLevel,
  ScenarioModelInput,
} from "@/types/pricing";

export const DEFAULT_ELASTICITY = -1;
export const DEFAULT_FRONTIER_MIN_MULTIPLIER = 0.7;
export const DEFAULT_FRONTIER_MAX_MULTIPLIER = 1.4;
export const DEFAULT_FRONTIER_STEPS = 61;
export const MIN_MEANINGFUL_PRICE_CHANGE = 0.01;

const ARC_METHOD =
  "Weighted median of adjacent, non-promotional midpoint (arc) elasticity estimates, with seasonal normalization when supplied.";
const CAUSAL_LIMITATION =
  "This observational estimate describes association, not causation; competitor moves, distribution, product changes, and other omitted factors may affect demand.";

export function roundTo(value: number, digits = 2): number {
  assertFiniteNumber(value, "value");
  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw new RangeError("digits must be an integer from 0 through 10.");
  }

  const factor = 10 ** digits;
  const magnitude = Math.abs(value) * factor;
  if (!Number.isFinite(magnitude) || magnitude > Number.MAX_SAFE_INTEGER) return value;
  const rounded =
    (Math.sign(value) * Math.round(magnitude + Number.EPSILON * Math.max(1, magnitude))) /
    factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateRevenue(price: number, quantity: number): number {
  assertNonNegative(price, "price");
  assertNonNegative(quantity, "quantity");
  return roundTo(price * quantity, 2);
}

export function calculateContributionProfit(
  price: number,
  unitCost: number,
  quantity: number,
): number {
  assertNonNegative(price, "price");
  assertNonNegative(unitCost, "unitCost");
  assertNonNegative(quantity, "quantity");
  return roundTo((price - unitCost) * quantity, 2);
}

/** Returns null when revenue is zero but profit is not, because margin is undefined. */
export function calculateMarginPercent(revenue: number, profit: number): number | null {
  assertFiniteNumber(revenue, "revenue");
  assertFiniteNumber(profit, "profit");
  if (revenue === 0) return profit === 0 ? 0 : null;
  return roundTo((profit / revenue) * 100, 2);
}

/** Contribution margin derived from unit economics. Price must be positive. */
export function calculateUnitMarginPercent(price: number, unitCost: number): number {
  assertPositive(price, "price");
  assertNonNegative(unitCost, "unitCost");
  return roundTo(((price - unitCost) / price) * 100, 2);
}

/** Markup on cost. Null when cost is zero because the ratio is undefined. */
export function calculateMarkupPercent(price: number, unitCost: number): number | null {
  assertNonNegative(price, "price");
  assertNonNegative(unitCost, "unitCost");
  if (unitCost === 0) return null;
  return roundTo(((price - unitCost) / unitCost) * 100, 2);
}

/** Percent change from `currentValue` to `proposedValue`; null for a changed zero base. */
export function calculatePercentChange(
  currentValue: number,
  proposedValue: number,
): number | null {
  assertFiniteNumber(currentValue, "currentValue");
  assertFiniteNumber(proposedValue, "proposedValue");
  if (currentValue === 0) return proposedValue === 0 ? 0 : null;
  return roundTo(((proposedValue - currentValue) / Math.abs(currentValue)) * 100, 2);
}

/** Constant-elasticity demand model: Q1 = Q0 × (P1 / P0)^elasticity. */
export function projectDemand(input: DemandProjectionInput): number {
  return roundTo(projectDemandRaw(input), 2);
}

function projectDemandRaw(input: DemandProjectionInput): number {
  assertPositive(input.baselinePrice, "baselinePrice");
  assertPositive(input.candidatePrice, "candidatePrice");
  assertNonNegative(input.baselineDemand, "baselineDemand");
  assertFiniteNumber(input.elasticity, "elasticity");
  if (input.inventoryLimit !== undefined) {
    assertNonNegative(input.inventoryLimit, "inventoryLimit");
  }

  const unconstrained =
    input.baselineDemand * (input.candidatePrice / input.baselinePrice) ** input.elasticity;
  const constrained =
    input.inventoryLimit === undefined
      ? unconstrained
      : Math.min(unconstrained, input.inventoryLimit);
  return Math.max(0, constrained);
}

export function calculatePricingMetrics(
  price: number,
  unitCost: number,
  demand: number,
): PricingMetrics {
  assertPositive(price, "price");
  assertNonNegative(unitCost, "unitCost");
  assertNonNegative(demand, "demand");

  const revenue = calculateRevenue(price, demand);
  const contributionProfit = calculateContributionProfit(price, unitCost, demand);
  return {
    price: roundTo(price, 2),
    demand: roundTo(demand, 2),
    revenue,
    contributionProfit,
    marginPercent: calculateMarginPercent(revenue, contributionProfit) ?? 0,
    markupPercent: calculateMarkupPercent(price, unitCost),
    unitContribution: roundTo(price - unitCost, 2),
  };
}

export function projectScenario(input: ScenarioModelInput): PricingScenario {
  assertNonNegative(input.unitCost, "unitCost");
  const projectedDemand = projectDemandRaw(input);
  const baselineDemand =
    input.inventoryLimit === undefined
      ? input.baselineDemand
      : Math.min(input.baselineDemand, input.inventoryLimit);
  const baseline = calculatePricingMetrics(
    input.baselinePrice,
    input.unitCost,
    baselineDemand,
  );
  const projected = calculatePricingMetrics(
    input.candidatePrice,
    input.unitCost,
    projectedDemand,
  );
  const priceChangePercent = calculatePercentChange(input.baselinePrice, input.candidatePrice) ?? 0;

  return {
    ...projected,
    id: input.id ?? slugify(input.label ?? `price-${projected.price}`),
    label: input.label ?? "Scenario",
    priceChangePercent,
    demandChangePercent: calculatePercentChange(baselineDemand, projectedDemand) ?? 0,
    revenueChangePercent: calculatePercentChange(baseline.revenue, projected.revenue) ?? 0,
    profitChangePercent: calculatePercentChange(
      baseline.contributionProfit,
      projected.contributionProfit,
    ),
    risk: scenarioRisk(priceChangePercent, input.elasticity),
    isBaseline: Math.abs(input.candidatePrice - input.baselinePrice) < 0.005,
  };
}

export function buildPriceFrontier(input: PriceFrontierInput): PriceFrontier {
  assertPositive(input.currentPrice, "currentPrice");
  assertNonNegative(input.baselineDemand, "baselineDemand");
  assertNonNegative(input.unitCost, "unitCost");
  assertFiniteNumber(input.elasticity, "elasticity");
  if (input.inventoryLimit !== undefined) {
    assertNonNegative(input.inventoryLimit, "inventoryLimit");
  }

  const defaultFloor = Math.max(
    0.01,
    input.currentPrice * DEFAULT_FRONTIER_MIN_MULTIPLIER,
    input.unitCost * 1.01,
  );
  const lowerBound = roundTo(
    input.minPrice ?? Math.min(input.currentPrice, defaultFloor),
    2,
  );
  const upperBound = roundTo(
    input.maxPrice ??
      Math.max(
        input.currentPrice * DEFAULT_FRONTIER_MAX_MULTIPLIER,
        input.unitCost * 1.2,
      ),
    2,
  );
  assertPositive(lowerBound, "minPrice");
  assertPositive(upperBound, "maxPrice");
  if (lowerBound >= upperBound) {
    throw new RangeError("minPrice must be lower than maxPrice.");
  }
  if (input.currentPrice < lowerBound || input.currentPrice > upperBound) {
    throw new RangeError("currentPrice must fall within the frontier bounds.");
  }

  const steps = input.steps ?? DEFAULT_FRONTIER_STEPS;
  if (!Number.isInteger(steps) || steps < 5 || steps > 401) {
    throw new RangeError("steps must be an integer from 5 through 401.");
  }

  const candidatePrices = new Set<number>([
    lowerBound,
    upperBound,
    roundTo(input.currentPrice, 2),
  ]);
  for (let index = 0; index < steps; index += 1) {
    const price = lowerBound + ((upperBound - lowerBound) * index) / (steps - 1);
    candidatePrices.add(roundTo(price, 2));
  }

  const rawPoints = [...candidatePrices]
    .sort((left, right) => left - right)
    .map((candidatePrice) => {
      const scenario = projectScenario({
        baselinePrice: input.currentPrice,
        candidatePrice,
        baselineDemand: input.baselineDemand,
        unitCost: input.unitCost,
        elasticity: input.elasticity,
        inventoryLimit: input.inventoryLimit,
      });
      return {
        price: scenario.price,
        demand: scenario.demand,
        revenue: scenario.revenue,
        contributionProfit: scenario.contributionProfit,
        marginPercent: scenario.marginPercent,
        markupPercent: scenario.markupPercent,
        unitContribution: scenario.unitContribution,
        priceChangePercent: scenario.priceChangePercent,
        demandChangePercent: scenario.demandChangePercent,
        revenueChangePercent: scenario.revenueChangePercent,
        profitChangePercent: scenario.profitChangePercent,
        isCurrent: nearlyEqual(candidatePrice, input.currentPrice, 0.005),
        isRevenueMaximum: false,
        isProfitMaximum: false,
      } satisfies PriceFrontierPoint;
    });

  const current =
    rawPoints.find((point) => point.isCurrent) ??
    rawPoints.reduce((closest, point) =>
      Math.abs(point.price - input.currentPrice) < Math.abs(closest.price - input.currentPrice)
        ? point
        : closest,
    );
  const revenueMaximum = selectMaximum(rawPoints, "revenue", input.currentPrice);
  const profitMaximum = selectMaximum(rawPoints, "contributionProfit", input.currentPrice);
  const points = rawPoints.map((point) => ({
    ...point,
    isCurrent: point.price === current.price,
    isRevenueMaximum: point.price === revenueMaximum.price,
    isProfitMaximum: point.price === profitMaximum.price,
  }));

  return {
    currentPrice: roundTo(input.currentPrice, 2),
    baselineDemand: roundTo(input.baselineDemand, 2),
    unitCost: roundTo(input.unitCost, 4),
    inventoryLimit: input.inventoryLimit,
    lowerBound,
    upperBound,
    elasticity: roundTo(input.elasticity, 4),
    points,
    current: points.find((point) => point.isCurrent)!,
    revenueMaximum: points.find((point) => point.isRevenueMaximum)!,
    profitMaximum: points.find((point) => point.isProfitMaximum)!,
  };
}

export function estimateArcElasticity(
  observations: readonly PricingObservation[],
): ElasticityEstimate {
  const usable = observations
    .filter(
      (observation) =>
        isValidIsoDate(observation.date) &&
        Number.isFinite(observation.price) &&
        observation.price > 0 &&
        Number.isFinite(observation.unitsSold) &&
        observation.unitsSold >= 0 &&
        (observation.seasonalIndex === undefined ||
          (Number.isFinite(observation.seasonalIndex) && observation.seasonalIndex > 0)),
    )
    .sort((left, right) => left.date.localeCompare(right.date));

  const productIds = new Set(usable.map((observation) => observation.productId));
  if (productIds.size > 1) {
    throw new RangeError("estimateArcElasticity accepts observations for one product only.");
  }

  const nonPromotional = usable.filter((observation) => !observation.isPromotion);
  const evidenceMonthCount = new Set(
    nonPromotional.map((observation) => observation.date.slice(0, 7)),
  ).size;
  const prices = nonPromotional.map((observation) => observation.price);
  const meanPrice = average(prices);
  const priceVariationPercent =
    prices.length > 1 && meanPrice > 0
      ? roundTo(((Math.max(...prices) - Math.min(...prices)) / meanPrice) * 100, 2)
      : 0;

  const pairEstimates: Array<{ value: number; weight: number }> = [];
  let extremePairCount = 0;
  let promotionalPairCount = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const previous = usable[index - 1];
    const current = usable[index];
    if (previous.isPromotion || current.isPromotion) {
      promotionalPairCount += 1;
      continue;
    }

    const midpointPrice = (previous.price + current.price) / 2;
    const priceChange = (current.price - previous.price) / midpointPrice;
    if (Math.abs(priceChange) < MIN_MEANINGFUL_PRICE_CHANGE) continue;

    const previousDemand = previous.unitsSold / (previous.seasonalIndex ?? 1);
    const currentDemand = current.unitsSold / (current.seasonalIndex ?? 1);
    const midpointDemand = (previousDemand + currentDemand) / 2;
    if (midpointDemand <= 0) continue;

    const demandChange = (currentDemand - previousDemand) / midpointDemand;
    const estimate = demandChange / priceChange;
    if (!Number.isFinite(estimate)) continue;
    if (Math.abs(estimate) > 8) {
      extremePairCount += 1;
      continue;
    }

    pairEstimates.push({
      value: estimate,
      weight: Math.abs(priceChange) * Math.sqrt(midpointDemand),
    });
  }

  const limitations: string[] = [CAUSAL_LIMITATION];
  if (evidenceMonthCount < 12) {
    limitations.push(
      "Fewer than 12 calendar months of non-promotional evidence limit stability across seasons.",
    );
  }
  if (pairEstimates.length < 4) {
    limitations.push("Fewer than four meaningful non-promotional price changes are available.");
  }
  if (priceVariationPercent < 5) {
    limitations.push("Observed prices vary by less than 5%, so price response is weakly identified.");
  }
  if (promotionalPairCount > 0) {
    limitations.push(
      `${promotionalPairCount} adjacent pair${promotionalPairCount === 1 ? " was" : "s were"} excluded because promotion effects can confound price response.`,
    );
  }
  if (extremePairCount > 0) {
    limitations.push(
      `${extremePairCount} implausibly extreme pair estimate${extremePairCount === 1 ? " was" : "s were"} excluded as an outlier.`,
    );
  }
  if (usable.some((observation) => observation.seasonalIndex === undefined)) {
    limitations.push("Some observations lack a seasonal index, so seasonal demand may affect the estimate.");
  }

  if (pairEstimates.length === 0) {
    return {
      elasticity: null,
      confidence: "low",
      confidenceScore: 0,
      method: ARC_METHOD,
      observationCount: usable.length,
      evidenceMonthCount,
      usablePairCount: 0,
      priceVariationPercent,
      robustDispersion: null,
      limitations: unique(limitations),
    };
  }

  const elasticity = weightedMedian(pairEstimates);
  const deviations = pairEstimates.map(({ value, weight }) => ({
    value: Math.abs(value - elasticity),
    weight,
  }));
  const robustDispersion = weightedMedian(deviations);
  const relativeDispersion = robustDispersion / Math.max(0.5, Math.abs(elasticity));
  if (relativeDispersion > 0.6) {
    limitations.push("Price-response estimates vary substantially between observed price changes.");
  }
  if (elasticity >= 0) {
    limitations.push(
      "The estimated response is non-negative, contrary to the usual demand relationship; treat it as a confounding signal rather than a pricing effect.",
    );
  }

  const pairScore = Math.min(1, pairEstimates.length / 6);
  const variationScore = Math.min(1, priceVariationPercent / 15);
  const stabilityScore = Math.max(0, 1 - Math.min(1, relativeDispersion));
  const historyScore = Math.min(1, evidenceMonthCount / 18);
  let confidenceScore =
    pairScore * 0.35 + variationScore * 0.3 + stabilityScore * 0.25 + historyScore * 0.1;
  if (elasticity >= 0) confidenceScore *= 0.35;
  if (pairEstimates.length < 4 || evidenceMonthCount < 4) {
    confidenceScore = Math.min(confidenceScore, 0.44);
  }
  if (evidenceMonthCount < 12 || priceVariationPercent < 5) {
    confidenceScore = Math.min(confidenceScore, 0.74);
  }
  confidenceScore = roundTo(Math.max(0, Math.min(1, confidenceScore)), 2);

  return {
    elasticity: roundTo(elasticity, 3),
    confidence: confidenceLevel(confidenceScore),
    confidenceScore,
    method: ARC_METHOD,
    observationCount: usable.length,
    evidenceMonthCount,
    usablePairCount: pairEstimates.length,
    priceVariationPercent,
    robustDispersion: roundTo(robustDispersion, 3),
    limitations: unique(limitations),
  };
}

/** Validates unknown/imported rows without coercing malformed values. */
export function validatePricingObservations(input: unknown): ObservationValidationResult {
  const errors: DataIssue[] = [];
  const warnings: DataIssue[] = [];
  const observations: PricingObservation[] = [];
  const sourceRowIndices: number[] = [];

  if (!Array.isArray(input) || input.length === 0) {
    errors.push({
      code: "invalid_collection",
      severity: "error",
      message: "Pricing data must be a non-empty array of observations.",
    });
    return { valid: false, observations, errors, warnings };
  }

  input.forEach((value, rowIndex) => {
    if (!isRecord(value)) {
      errors.push({
        code: "invalid_value",
        severity: "error",
        rowIndex,
        message: `Row ${rowIndex + 1} must be an object.`,
      });
      return;
    }

    const rowErrors: DataIssue[] = [];
    const requiredStrings = ["date", "productId", "productName", "category"] as const;
    for (const field of requiredStrings) {
      if (typeof value[field] !== "string" || value[field].trim() === "") {
        rowErrors.push({
          code: "missing_field",
          severity: "error",
          rowIndex,
          field,
          message: `Row ${rowIndex + 1}: ${field} is required.`,
        });
      }
    }

    if (typeof value.date === "string" && !isValidIsoDate(value.date)) {
      rowErrors.push({
        code: "invalid_date",
        severity: "error",
        rowIndex,
        field: "date",
        message: `Row ${rowIndex + 1}: date must be a real calendar date in YYYY-MM-DD format.`,
      });
    }

    const numericFields = ["price", "unitCost", "unitsSold", "inventory"] as const;
    for (const field of numericFields) {
      const numericValue = value[field];
      if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
        rowErrors.push({
          code: "invalid_number",
          severity: "error",
          rowIndex,
          field,
          message: `Row ${rowIndex + 1}: ${field} must be a finite number.`,
        });
      } else if (numericValue < 0) {
        rowErrors.push({
          code: "negative_value",
          severity: "error",
          rowIndex,
          field,
          message: `Row ${rowIndex + 1}: ${field} cannot be negative.`,
        });
      }
    }

    if (typeof value.price === "number" && Number.isFinite(value.price) && value.price === 0) {
      rowErrors.push({
        code: "non_positive_price",
        severity: "error",
        rowIndex,
        field: "price",
        message: `Row ${rowIndex + 1}: price must be greater than zero.`,
      });
    }
    if (
      value.seasonalIndex !== undefined &&
      (typeof value.seasonalIndex !== "number" ||
        !Number.isFinite(value.seasonalIndex) ||
        value.seasonalIndex <= 0)
    ) {
      rowErrors.push({
        code: "invalid_seasonal_index",
        severity: "error",
        rowIndex,
        field: "seasonalIndex",
        message: `Row ${rowIndex + 1}: seasonalIndex must be a finite number greater than zero.`,
      });
    }
    if (value.isPromotion !== undefined && typeof value.isPromotion !== "boolean") {
      rowErrors.push({
        code: "invalid_value",
        severity: "error",
        rowIndex,
        field: "isPromotion",
        message: `Row ${rowIndex + 1}: isPromotion must be true or false.`,
      });
    }
    if (value.note !== undefined && typeof value.note !== "string") {
      rowErrors.push({
        code: "invalid_value",
        severity: "error",
        rowIndex,
        field: "note",
        message: `Row ${rowIndex + 1}: note must be text.`,
      });
    }

    errors.push(...rowErrors);
    if (rowErrors.length > 0) return;

    const observation: PricingObservation = {
      date: (value.date as string).trim(),
      productId: (value.productId as string).trim(),
      productName: (value.productName as string).trim(),
      category: (value.category as string).trim(),
      price: value.price as number,
      unitCost: value.unitCost as number,
      unitsSold: value.unitsSold as number,
      inventory: value.inventory as number,
    };
    if (typeof value.isPromotion === "boolean") observation.isPromotion = value.isPromotion;
    if (typeof value.seasonalIndex === "number") observation.seasonalIndex = value.seasonalIndex;
    if (typeof value.note === "string") observation.note = value.note;
    observations.push(observation);
    sourceRowIndices.push(rowIndex);

    if (observation.unitCost > observation.price) {
      warnings.push({
        code: "cost_above_price",
        severity: "warning",
        rowIndex,
        productId: observation.productId,
        field: "unitCost",
        message: `Row ${rowIndex + 1}: unit cost exceeds price and produces negative contribution profit.`,
      });
    }
  });

  const seen = new Map<string, number>();
  observations.forEach((observation, validIndex) => {
    const key = `${observation.productId}\u0000${observation.date}`;
    const priorIndex = seen.get(key);
    if (priorIndex !== undefined) {
      errors.push({
        code: "duplicate_observation",
        severity: "error",
        rowIndex: sourceRowIndices[validIndex],
        productId: observation.productId,
        message: `${observation.productId} has duplicate observations for ${observation.date}.`,
      });
    } else {
      seen.set(key, validIndex);
    }
  });

  const byProduct = groupByProduct(observations);
  for (const [productId, productRows] of byProduct) {
    if (productRows.length < 4) {
      warnings.push({
        code: "insufficient_history",
        severity: "warning",
        productId,
        message: `${productId} has fewer than four observations; scenario modeling will use a disclosed fallback elasticity.`,
      });
    }
    const productPrices = productRows.map((row) => row.price);
    const mean = average(productPrices);
    const spread = mean > 0 ? (Math.max(...productPrices) - Math.min(...productPrices)) / mean : 0;
    if (spread < MIN_MEANINGFUL_PRICE_CHANGE) {
      warnings.push({
        code: "insufficient_price_variation",
        severity: "warning",
        productId,
        message: `${productId} has no meaningful historical price variation.`,
      });
    }

    const medianUnits = median(productRows.map((row) => row.unitsSold));
    const medianPrice = median(productPrices);
    productRows.forEach((row) => {
      if (
        (medianUnits > 0 && row.unitsSold > medianUnits * 4) ||
        (medianPrice > 0 && (row.price > medianPrice * 2 || row.price < medianPrice * 0.5))
      ) {
        warnings.push({
          code: "suspicious_outlier",
          severity: "warning",
          productId,
          message: `${productId} has a suspicious price or demand outlier on ${row.date}.`,
        });
      }
    });
  }

  return { valid: errors.length === 0, observations, errors, warnings };
}

export const calculateProfit = calculateContributionProfit;
export const calculateMargin = calculateMarginPercent;
export const calculatePriceChangePercent = calculatePercentChange;

function selectMaximum(
  points: readonly PriceFrontierPoint[],
  field: "revenue" | "contributionProfit",
  currentPrice: number,
): PriceFrontierPoint {
  const maximum = Math.max(...points.map((point) => point[field]));
  return [...points]
    .filter((point) => nearlyEqual(point[field], maximum, 0.005))
    .sort((left, right) => {
      const distance =
        Math.abs(left.price - currentPrice) - Math.abs(right.price - currentPrice);
      return distance === 0 ? left.price - right.price : distance;
    })[0];
}

function weightedMedian(values: readonly { value: number; weight: number }[]): number {
  const sorted = [...values].sort((left, right) => left.value - right.value);
  const totalWeight = sorted.reduce((total, item) => total + item.weight, 0);
  if (totalWeight <= 0) return median(sorted.map((item) => item.value));
  let cumulative = 0;
  const midpoint = totalWeight / 2;
  const tolerance = Number.EPSILON * Math.max(1, totalWeight) * 16;
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    cumulative += item.weight;
    if (Math.abs(cumulative - midpoint) <= tolerance && sorted[index + 1]) {
      return (item.value + sorted[index + 1].value) / 2;
    }
    if (cumulative > midpoint) return item.value;
  }
  return sorted[sorted.length - 1].value;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function scenarioRisk(priceChangePercent: number, elasticity: number): RiskLevel {
  const exposure = Math.abs(priceChangePercent) * (1 + Math.max(0, Math.abs(elasticity) - 1) * 0.5);
  if (exposure > 18) return "high";
  if (exposure > 8) return "medium";
  return "low";
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number.`);
}

function assertNonNegative(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value < 0) throw new RangeError(`${name} cannot be negative.`);
}

function assertPositive(value: number, name: string): void {
  assertFiniteNumber(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero.`);
}

function nearlyEqual(left: number, right: number, tolerance = 1e-9): boolean {
  return Math.abs(left - right) <= tolerance;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "scenario"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function groupByProduct(
  observations: readonly PricingObservation[],
): Map<string, PricingObservation[]> {
  const groups = new Map<string, PricingObservation[]>();
  observations.forEach((observation) => {
    const group = groups.get(observation.productId) ?? [];
    group.push(observation);
    groups.set(observation.productId, group);
  });
  return groups;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
