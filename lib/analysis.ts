import {
  DEFAULT_ELASTICITY,
  buildPriceFrontier,
  calculateContributionProfit,
  calculateMarginPercent,
  calculatePercentChange,
  calculatePricingMetrics,
  calculateRevenue,
  estimateArcElasticity,
  projectScenario,
  roundTo,
  validatePricingObservations,
} from "@/lib/economics";
import type {
  ConfidenceLevel,
  DecisionBrief,
  ElasticityEstimate,
  ExperimentProposal,
  PortfolioOpportunity,
  PortfolioSummary,
  PriceFrontier,
  PriceFrontierInput,
  PricingObservation,
  PricingScenario,
  ProductAnalysis,
  ProductPeriodSummary,
  RiskLevel,
  SensitivityCase,
} from "@/types/pricing";

export interface ProductAnalysisOptions {
  frontierMinPrice?: number;
  frontierMaxPrice?: number;
  frontierSteps?: number;
  fallbackElasticity?: number;
}

export const FALLBACK_ELASTICITY_DISCLOSURE =
  "Historical data cannot support a stable, economically plausible elasticity estimate; scenarios use a neutral -1.0 fallback and require validation.";

export function generateScenarios(
  input: PriceFrontierInput,
  recommendedPrice?: number,
): PricingScenario[] {
  const frontier = buildPriceFrontier(input);
  const target = clamp(
    recommendedPrice ?? frontier.profitMaximum.price,
    frontier.lowerBound,
    frontier.upperBound,
  );
  const move = target - input.currentPrice;
  const conservativePrice =
    Math.abs(move) >= 0.01
      ? input.currentPrice + move * 0.5
      : input.currentPrice * 0.97;
  const aggressivePrice =
    Math.abs(move) >= 0.01
      ? input.currentPrice + move * 1.4
      : input.currentPrice * 1.05;

  const definitions = [
    { id: "current", label: "Current", price: input.currentPrice },
    {
      id: "conservative",
      label: "Conservative",
      price: clamp(conservativePrice, frontier.lowerBound, frontier.upperBound),
    },
    { id: "recommended", label: "Recommended", price: target },
    {
      id: "aggressive",
      label: "Aggressive",
      price: clamp(aggressivePrice, frontier.lowerBound, frontier.upperBound),
    },
  ];

  return definitions.map((definition) =>
    projectScenario({
      id: definition.id,
      label: definition.label,
      baselinePrice: input.currentPrice,
      candidatePrice: roundTo(definition.price, 2),
      baselineDemand: input.baselineDemand,
      unitCost: input.unitCost,
      elasticity: input.elasticity,
      inventoryLimit: input.inventoryLimit,
    }),
  );
}

export function runSensitivityAnalysis(
  input: PriceFrontierInput,
  elasticityBand = 0.25,
): SensitivityCase[] {
  if (!Number.isFinite(elasticityBand) || elasticityBand < 0 || elasticityBand > 1) {
    throw new RangeError("elasticityBand must be between zero and one.");
  }

  const assumptions = [
    {
      id: "low" as const,
      label: "Less elastic",
      elasticity: input.elasticity * (1 - elasticityBand),
    },
    {
      id: "expected" as const,
      label: "Expected",
      elasticity: input.elasticity,
    },
    {
      id: "high" as const,
      label: "More elastic",
      elasticity: input.elasticity * (1 + elasticityBand),
    },
  ];

  return assumptions.map((assumption) => {
    const frontier = buildPriceFrontier({ ...input, elasticity: assumption.elasticity });
    const best = frontier.profitMaximum;
    return {
      id: assumption.id,
      label: assumption.label,
      elasticity: roundTo(assumption.elasticity, 3),
      recommendedPrice: best.price,
      projectedDemand: best.demand,
      projectedRevenue: best.revenue,
      projectedProfit: best.contributionProfit,
      marginPercent: best.marginPercent,
      profitUpside: roundTo(
        best.contributionProfit - frontier.current.contributionProfit,
        2,
      ),
      profitUpsidePercent: calculatePercentChange(
        frontier.current.contributionProfit,
        best.contributionProfit,
      ),
    };
  });
}

/** Turns the theoretical frontier optimum into a confidence-sized test recommendation. */
export function generateDecisionBrief(
  frontier: PriceFrontier,
  elasticityEstimate: ElasticityEstimate,
): DecisionBrief {
  const maximumMoveByConfidence: Record<ConfidenceLevel, number> = {
    low: 5,
    medium: 8,
    high: 12,
  };
  const theoreticalTarget = frontier.profitMaximum.price;
  const theoreticalMove = calculatePercentChange(frontier.currentPrice, theoreticalTarget) ?? 0;
  const moveLimit = maximumMoveByConfidence[elasticityEstimate.confidence];
  const boundedMove = clamp(theoreticalMove, -moveLimit, moveLimit);
  const stagedPrice = roundTo(frontier.currentPrice * (1 + boundedMove / 100), 2);
  const stagedScenario = projectScenario({
    id: "decision",
    label: "Decision",
    baselinePrice: frontier.currentPrice,
    candidatePrice: clamp(stagedPrice, frontier.lowerBound, frontier.upperBound),
    baselineDemand: frontier.baselineDemand,
    unitCost: frontier.unitCost,
    elasticity: frontier.elasticity,
    inventoryLimit: frontier.inventoryLimit,
  });
  const profitPercent = stagedScenario.profitChangePercent;
  const stagedProfitAbsolute = roundTo(
    stagedScenario.contributionProfit - frontier.current.contributionProfit,
    2,
  );
  const materialProfitImprovement =
    profitPercent === null
      ? stagedProfitAbsolute > Math.max(0.01, frontier.current.revenue * 0.005)
      : profitPercent > 0.5;
  const immaterial =
    Math.abs(stagedScenario.priceChangePercent) < 0.75 ||
    !materialProfitImprovement;
  const action: DecisionBrief["action"] = immaterial
    ? "hold"
    : stagedScenario.price > frontier.currentPrice
      ? "test_increase"
      : "test_decrease";
  const recommendedPrice = action === "hold" ? frontier.currentPrice : stagedScenario.price;
  const chosen =
    action === "hold"
      ? projectScenario({
          id: "hold",
          label: "Hold",
          baselinePrice: frontier.currentPrice,
          candidatePrice: frontier.currentPrice,
          baselineDemand: frontier.baselineDemand,
          unitCost: frontier.unitCost,
          elasticity: frontier.elasticity,
          inventoryLimit: frontier.inventoryLimit,
        })
      : stagedScenario;
  const direction = action === "test_increase" ? "increase" : "decrease";
  const directionArticle = direction === "increase" ? "an" : "a";
  const demandCharacter =
    Math.abs(frontier.elasticity) < 0.8
      ? "relatively insensitive"
      : Math.abs(frontier.elasticity) > 1.2
        ? "price-sensitive"
        : "approximately unit elastic";
  const isStaged = Math.abs(recommendedPrice - theoreticalTarget) >= 0.01;
  const specificRisk =
    elasticityEstimate.limitations.find(
      (limitation) => !limitation.startsWith("This observational estimate"),
    ) ?? elasticityEstimate.limitations[0];
  const economicTradeoff =
    action === "test_decrease"
      ? `The ${formatSigned(chosen.demandChangePercent)}% modeled demand change is expected to outweigh lower contribution per unit.`
      : `Added contribution per unit is modeled to outweigh the ${formatSigned(chosen.demandChangePercent)}% demand change.`;

  const reasoning =
    action === "hold"
      ? [
          "No tested price in the confidence-sized range produces a material modeled profit improvement.",
          `Modeled demand is ${demandCharacter} at elasticity ${formatSigned(frontier.elasticity)}.`,
        ]
      : [
          `Modeled demand is ${demandCharacter} at elasticity ${formatSigned(frontier.elasticity)}.`,
          economicTradeoff,
          isStaged
            ? `The frontier optimum is ${formatCurrency(theoreticalTarget)}; this brief limits the first test to a ${moveLimit}% move because confidence is ${elasticityEstimate.confidence}.`
            : "The recommendation matches the modeled profit maximum within the evaluated range.",
        ];

  return {
    action,
    headline:
      action === "hold"
        ? "Hold price while collecting stronger evidence"
        : `Test ${directionArticle} ${direction} to ${formatCurrency(recommendedPrice)}`,
    recommendation:
      action === "hold"
        ? `Keep price at ${formatCurrency(frontier.currentPrice)} for now.`
        : `Test a price ${direction} from ${formatCurrency(frontier.currentPrice)} to ${formatCurrency(recommendedPrice)}.`,
    currentPrice: frontier.currentPrice,
    recommendedPrice,
    expectedImpact: {
      pricePercent: chosen.priceChangePercent,
      demandPercent: chosen.demandChangePercent,
      revenuePercent: chosen.revenueChangePercent,
      profitPercent: chosen.profitChangePercent,
      revenueAbsolute: roundTo(chosen.revenue - frontier.current.revenue, 2),
      profitAbsolute: roundTo(
        chosen.contributionProfit - frontier.current.contributionProfit,
        2,
      ),
    },
    confidence: elasticityEstimate.confidence,
    confidenceScore: elasticityEstimate.confidenceScore,
    reasoning,
    primaryRisk:
      specificRisk ??
      "Historical price response may not persist; validate the modeled result with a controlled test.",
  };
}

export function proposePricingExperiment(brief: DecisionBrief): ExperimentProposal {
  if (brief.action === "hold") {
    return {
      status: "not_recommended",
      controlPrice: brief.currentPrice,
      treatmentPrice: brief.currentPrice,
      primaryMetric: "Contribution profit per eligible customer",
      guardrails: ["Conversion rate", "Units per order", "Refund rate", "Customer complaints"],
      hypothesis:
        "Available evidence does not support a material price treatment; gather more non-promotional price variation first.",
      rolloutGuidance: "Do not launch a price test until the treatment is economically distinct and measurable.",
      stopConditions: ["Unexpected data-quality degradation", "Material customer harm"],
      caveat: brief.primaryRisk,
    };
  }

  const direction = brief.action === "test_increase" ? "increase" : "decrease";
  const priceMove = Math.abs(brief.expectedImpact.pricePercent).toFixed(2);
  const profitImpact =
    brief.expectedImpact.profitPercent === null
      ? `${formatCurrency(brief.expectedImpact.profitAbsolute)} per modeled period`
      : `${formatSigned(brief.expectedImpact.profitPercent)}%`;
  return {
    status: "proposed",
    controlPrice: brief.currentPrice,
    treatmentPrice: brief.recommendedPrice,
    primaryMetric: "Contribution profit per eligible customer",
    guardrails: ["Conversion rate", "Units per order", "Refund rate", "Customer complaints"],
    hypothesis: `A ${priceMove}% price ${direction} is modeled to change demand by ${formatSigned(brief.expectedImpact.demandPercent)}% and contribution profit by ${profitImpact}.`,
    rolloutGuidance:
      "Start with a limited, representative treatment cohort. Set sample size and duration from actual traffic, variance, and minimum detectable effect before launch.",
    stopConditions: [
      "A guardrail crosses its pre-registered tolerance",
      "Observed contribution profit materially underperforms control",
      "Instrumentation or assignment integrity fails",
    ],
    caveat: `${brief.primaryRisk} The forecast is a decision input, not a guaranteed outcome.`,
  };
}

export function analyzeProduct(
  input: readonly PricingObservation[],
  options: ProductAnalysisOptions = {},
): ProductAnalysis {
  const validation = validatePricingObservations(input);
  if (!validation.valid) {
    throw new RangeError(validation.errors[0]?.message ?? "Product data is invalid.");
  }

  const productIds = new Set(validation.observations.map((observation) => observation.productId));
  if (productIds.size !== 1) {
    throw new RangeError("analyzeProduct accepts observations for exactly one product.");
  }
  const observations = [...validation.observations].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const latestObservation = observations[observations.length - 1];
  const elasticityEstimate = estimateArcElasticity(observations);
  const fallbackElasticity = options.fallbackElasticity ?? DEFAULT_ELASTICITY;
  if (!Number.isFinite(fallbackElasticity) || fallbackElasticity > 0) {
    throw new RangeError("fallbackElasticity must be a finite, non-positive number.");
  }
  const estimateIsModelEligible =
    elasticityEstimate.elasticity !== null &&
    elasticityEstimate.elasticity < 0 &&
    elasticityEstimate.usablePairCount >= 4 &&
    elasticityEstimate.evidenceMonthCount >= 4 &&
    elasticityEstimate.confidence !== "low";
  const modeledElasticity = estimateIsModelEligible
    ? elasticityEstimate.elasticity!
    : fallbackElasticity;
  const baselineDemand = deriveBaselineDemand(
    observations,
    latestObservation,
    modeledElasticity,
  );
  const frontierInput: PriceFrontierInput = {
    currentPrice: latestObservation.price,
    baselineDemand,
    unitCost: latestObservation.unitCost,
    elasticity: modeledElasticity,
    minPrice: options.frontierMinPrice,
    maxPrice: options.frontierMaxPrice,
    steps: options.frontierSteps,
  };
  const frontier = buildPriceFrontier(frontierInput);
  const decisionBrief = generateDecisionBrief(frontier, elasticityEstimate);
  const scenarios = generateScenarios(frontierInput, decisionBrief.recommendedPrice);
  const sensitivity = runSensitivityAnalysis(frontierInput);
  const warnings = [
    ...validation.warnings.map((warning) => warning.message),
    ...elasticityEstimate.limitations,
  ];
  if (!estimateIsModelEligible) {
    warnings.push(
      fallbackElasticity === DEFAULT_ELASTICITY
        ? FALLBACK_ELASTICITY_DISCLOSURE
        : `Historical data cannot support a stable, economically plausible elasticity estimate; scenarios use the configured ${formatSigned(fallbackElasticity)} fallback and require validation.`,
    );
  }

  return {
    productId: latestObservation.productId,
    productName: latestObservation.productName,
    category: latestObservation.category,
    observations,
    latestObservation,
    periodSummary: summarizeProductPeriod(observations),
    baselineDemand,
    currentMetrics: calculatePricingMetrics(
      latestObservation.price,
      latestObservation.unitCost,
      baselineDemand,
    ),
    elasticityEstimate,
    modeledElasticity: roundTo(modeledElasticity, 3),
    frontier,
    scenarios,
    sensitivity,
    decisionBrief,
    experiment: proposePricingExperiment(decisionBrief),
    dataWarnings: [...new Set(warnings)],
  };
}

export function findPortfolioOpportunities(
  observations: readonly PricingObservation[],
): PortfolioOpportunity[] {
  return buildOpportunityList(analyzeProducts(observations));
}

export function analyzePortfolio(
  input: readonly PricingObservation[],
): PortfolioSummary {
  const validation = validatePricingObservations(input);
  if (!validation.valid) {
    throw new RangeError(validation.errors[0]?.message ?? "Portfolio data is invalid.");
  }
  const analyses = analyzeProducts(validation.observations);
  const totalUnits = roundTo(
    validation.observations.reduce((total, observation) => total + observation.unitsSold, 0),
    2,
  );
  const totalRevenue = roundTo(
    validation.observations.reduce(
      (total, observation) =>
        total + calculateRevenue(observation.price, observation.unitsSold),
      0,
    ),
    2,
  );
  const totalContributionProfit = roundTo(
    validation.observations.reduce(
      (total, observation) =>
        total +
        calculateContributionProfit(
          observation.price,
          observation.unitCost,
          observation.unitsSold,
        ),
      0,
    ),
    2,
  );
  const latestInventory = roundTo(
    analyses.reduce((total, analysis) => total + analysis.latestObservation.inventory, 0),
    2,
  );
  const opportunities = buildOpportunityList(analyses);

  return {
    productCount: analyses.length,
    observationCount: validation.observations.length,
    totalUnits,
    totalRevenue,
    totalContributionProfit,
    contributionMarginPercent:
      calculateMarginPercent(totalRevenue, totalContributionProfit) ?? 0,
    averageSellingPrice: totalUnits === 0 ? 0 : roundTo(totalRevenue / totalUnits, 2),
    latestInventory,
    pricingOpportunityCount: analyses.filter(
      (analysis) =>
        analysis.decisionBrief.action !== "hold" &&
        analysis.decisionBrief.expectedImpact.profitAbsolute > 0,
    ).length,
    analyses,
    opportunities,
  };
}

export function summarizeProductPeriod(
  observations: readonly PricingObservation[],
): ProductPeriodSummary {
  if (observations.length === 0) {
    throw new RangeError("At least one observation is required.");
  }
  const totalUnits = roundTo(
    observations.reduce((total, observation) => total + observation.unitsSold, 0),
    2,
  );
  const totalRevenue = roundTo(
    observations.reduce(
      (total, observation) =>
        total + calculateRevenue(observation.price, observation.unitsSold),
      0,
    ),
    2,
  );
  const totalContributionProfit = roundTo(
    observations.reduce(
      (total, observation) =>
        total +
        calculateContributionProfit(
          observation.price,
          observation.unitCost,
          observation.unitsSold,
        ),
      0,
    ),
    2,
  );
  const prices = observations.map((observation) => observation.price);
  return {
    observationCount: observations.length,
    totalUnits,
    totalRevenue,
    totalContributionProfit,
    averageSellingPrice: totalUnits === 0 ? 0 : roundTo(totalRevenue / totalUnits, 2),
    contributionMarginPercent:
      calculateMarginPercent(totalRevenue, totalContributionProfit) ?? 0,
    priceLow: Math.min(...prices),
    priceHigh: Math.max(...prices),
  };
}

function analyzeProducts(observations: readonly PricingObservation[]): ProductAnalysis[] {
  const groups = new Map<string, PricingObservation[]>();
  observations.forEach((observation) => {
    const group = groups.get(observation.productId) ?? [];
    group.push(observation);
    groups.set(observation.productId, group);
  });
  return [...groups.values()]
    .map((group) => analyzeProduct(group))
    .sort((left, right) => left.productName.localeCompare(right.productName));
}

function deriveBaselineDemand(
  observations: readonly PricingObservation[],
  latest: PricingObservation,
  elasticity: number,
): number {
  const nonPromotional = observations.filter((observation) => !observation.isPromotion);
  const candidates = (nonPromotional.length >= 3 ? nonPromotional : observations).slice(-4);
  const latestSeasonalIndex = latest.seasonalIndex ?? 1;
  let totalWeight = 0;
  let weightedDemand = 0;
  candidates.forEach((observation, index) => {
    const recencyWeight = index + 1;
    const seasonallyNormalized = observation.unitsSold / (observation.seasonalIndex ?? 1);
    const repriced =
      seasonallyNormalized * (latest.price / observation.price) ** elasticity;
    weightedDemand += repriced * latestSeasonalIndex * recencyWeight;
    totalWeight += recencyWeight;
  });
  return roundTo(totalWeight === 0 ? latest.unitsSold : weightedDemand / totalWeight, 2);
}

function buildOpportunityList(analyses: readonly ProductAnalysis[]): PortfolioOpportunity[] {
  if (analyses.length === 0) return [];

  const profitAnalysis = [...analyses].sort((left, right) => {
    const leftUpside =
      left.frontier.profitMaximum.contributionProfit - left.frontier.current.contributionProfit;
    const rightUpside =
      right.frontier.profitMaximum.contributionProfit - right.frontier.current.contributionProfit;
    return rightUpside - leftUpside || left.productName.localeCompare(right.productName);
  })[0];
  const profitUpside = roundTo(
    profitAnalysis.frontier.profitMaximum.contributionProfit -
      profitAnalysis.frontier.current.contributionProfit,
    2,
  );
  const profitUpsidePercent =
    calculatePercentChange(
      profitAnalysis.frontier.current.contributionProfit,
      profitAnalysis.frontier.profitMaximum.contributionProfit,
    ) ??
    (profitAnalysis.frontier.current.revenue > 0
      ? roundTo(
          (profitUpside / profitAnalysis.frontier.current.revenue) * 100,
          2,
        )
      : profitUpside > 0
        ? 100
        : 0);

  const estimable = analyses.filter(
    (analysis) =>
      analysis.elasticityEstimate.elasticity !== null &&
      analysis.elasticityEstimate.elasticity < 0,
  );
  const elasticityAnalysis = [...(estimable.length > 0 ? estimable : analyses)].sort(
    (left, right) =>
      Math.abs(right.modeledElasticity) - Math.abs(left.modeledElasticity) ||
      left.productName.localeCompare(right.productName),
  )[0];

  const inventoryAnalysis = [...analyses].sort((left, right) => {
    const leftCoverage = left.latestObservation.inventory / Math.max(1, left.baselineDemand);
    const rightCoverage = right.latestObservation.inventory / Math.max(1, right.baselineDemand);
    return rightCoverage - leftCoverage || left.productName.localeCompare(right.productName);
  })[0];
  const inventoryCoverage = roundTo(
    inventoryAnalysis.latestObservation.inventory /
      Math.max(1, inventoryAnalysis.baselineDemand),
    1,
  );

  const confidenceAnalysis = [...analyses].sort(
    (left, right) =>
      right.elasticityEstimate.confidenceScore - left.elasticityEstimate.confidenceScore ||
      left.productName.localeCompare(right.productName),
  )[0];

  return [
    {
      id: `profit-upside-${profitAnalysis.productId}`,
      kind: "profit_upside",
      productId: profitAnalysis.productId,
      productName: profitAnalysis.productName,
      title: "Largest modeled profit opportunity",
      insight: `${profitAnalysis.productName} has ${formatCurrency(profitUpside)} modeled contribution-profit upside per comparable period at the frontier optimum.`,
      metricValue: profitUpside,
      metricLabel: formatCurrency(profitUpside),
      priority: priorityFromThreshold(profitUpsidePercent, 10, 3),
      confidence: profitAnalysis.elasticityEstimate.confidence,
    },
    {
      id: `elasticity-risk-${elasticityAnalysis.productId}`,
      kind: "elasticity_risk",
      productId: elasticityAnalysis.productId,
      productName: elasticityAnalysis.productName,
      title: "Highest price-sensitivity risk",
      insight: `${elasticityAnalysis.productName} has the largest modeled demand response: elasticity ${formatSigned(elasticityAnalysis.modeledElasticity)}.`,
      metricValue: elasticityAnalysis.modeledElasticity,
      metricLabel: formatSigned(elasticityAnalysis.modeledElasticity),
      priority: priorityFromThreshold(
        Math.abs(elasticityAnalysis.modeledElasticity),
        1.5,
        1,
      ),
      confidence: elasticityAnalysis.elasticityEstimate.confidence,
    },
    {
      id: `inventory-${inventoryAnalysis.productId}`,
      kind: "inventory",
      productId: inventoryAnalysis.productId,
      productName: inventoryAnalysis.productName,
      title: "Inventory coverage watch",
      insight: `${inventoryAnalysis.productName} holds about ${inventoryCoverage.toFixed(1)} modeled recent-demand periods at the latest inventory level.`,
      metricValue: inventoryCoverage,
      metricLabel: `${inventoryCoverage.toFixed(1)} periods`,
      priority: priorityFromThreshold(inventoryCoverage, 3, 2),
      confidence: inventoryAnalysis.elasticityEstimate.confidence,
    },
    {
      id: `confidence-${confidenceAnalysis.productId}`,
      kind: "confidence",
      productId: confidenceAnalysis.productId,
      productName: confidenceAnalysis.productName,
      title: "Strongest historical signal",
      insight: `${confidenceAnalysis.productName} has the portfolio's strongest elasticity evidence (${Math.round(confidenceAnalysis.elasticityEstimate.confidenceScore * 100)}/100 confidence score).`,
      metricValue: confidenceAnalysis.elasticityEstimate.confidenceScore,
      metricLabel: `${Math.round(confidenceAnalysis.elasticityEstimate.confidenceScore * 100)}/100`,
      priority:
        confidenceAnalysis.elasticityEstimate.confidence === "high"
          ? "low"
          : confidenceAnalysis.elasticityEstimate.confidence === "medium"
            ? "medium"
            : "high",
      confidence: confidenceAnalysis.elasticityEstimate.confidence,
    },
  ];
}

function priorityFromThreshold(value: number, high: number, medium: number): RiskLevel {
  if (value >= high) return "high";
  if (value >= medium) return "medium";
  return "low";
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new TypeError("value must be finite.");
  return Math.min(maximum, Math.max(minimum, value));
}

function formatCurrency(value: number): string {
  return `$${roundTo(value, 2).toFixed(2)}`;
}

function formatSigned(value: number): string {
  const rounded = roundTo(value, 2);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
}
