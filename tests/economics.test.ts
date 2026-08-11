import { describe, expect, it } from "vitest";

import {
  analyzePortfolio,
  analyzeProduct,
  generateDecisionBrief,
  generateScenarios,
  proposePricingExperiment,
  runSensitivityAnalysis,
} from "@/lib/analysis";
import {
  buildPriceFrontier,
  calculateContributionProfit,
  calculateMarginPercent,
  calculateMarkupPercent,
  calculatePercentChange,
  calculateRevenue,
  calculateUnitMarginPercent,
  estimateArcElasticity,
  projectDemand,
  projectScenario,
  roundTo,
  validatePricingObservations,
} from "@/lib/economics";
import {
  SYNTHETIC_DATA_NOTICE,
  sampleObservations,
  sampleProductProfiles,
} from "@/data/sample";
import type { ElasticityEstimate, PricingObservation } from "@/types/pricing";

describe("economic primitives", () => {
  it("calculates revenue and contribution profit", () => {
    expect(calculateRevenue(12.5, 40)).toBe(500);
    expect(calculateContributionProfit(12.5, 5.5, 40)).toBe(280);
  });

  it("calculates contribution margin and markup with distinct denominators", () => {
    expect(calculateMarginPercent(500, 280)).toBe(56);
    expect(calculateUnitMarginPercent(12.5, 5.5)).toBe(56);
    expect(calculateMarkupPercent(12.5, 5.5)).toBe(127.27);
  });

  it("handles zero-denominator ratios without Infinity", () => {
    expect(calculateMarginPercent(0, 0)).toBe(0);
    expect(calculateMarginPercent(0, -5)).toBeNull();
    expect(calculateMarkupPercent(10, 0)).toBeNull();
    expect(calculatePercentChange(0, 0)).toBe(0);
    expect(calculatePercentChange(0, 10)).toBeNull();
  });

  it("uses the original value as the percent-change base", () => {
    expect(calculatePercentChange(25, 27.5)).toBe(10);
    expect(calculatePercentChange(25, 20)).toBe(-20);
  });

  it("rounds decimal ties symmetrically at currency precision", () => {
    expect(roundTo(10.075, 2)).toBe(10.08);
    expect(roundTo(-10.075, 2)).toBe(-10.08);
    expect(roundTo(Number.MAX_VALUE, 2)).toBe(Number.MAX_VALUE);
  });

  it("rejects non-finite and impossible primitive inputs", () => {
    expect(() => calculateRevenue(-1, 10)).toThrow("price cannot be negative");
    expect(() => calculateContributionProfit(10, -1, 10)).toThrow(
      "unitCost cannot be negative",
    );
    expect(() => calculateRevenue(Number.NaN, 2)).toThrow("finite number");
  });
});

describe("constant-elasticity demand and scenarios", () => {
  it("projects demand with Q1 = Q0 × (P1/P0)^elasticity", () => {
    expect(
      projectDemand({
        baselinePrice: 100,
        candidatePrice: 110,
        baselineDemand: 100,
        elasticity: -2,
      }),
    ).toBeCloseTo(82.64, 2);
  });

  it("leaves demand unchanged at the same price and supports zero demand", () => {
    expect(
      projectDemand({
        baselinePrice: 50,
        candidatePrice: 50,
        baselineDemand: 120,
        elasticity: -1.4,
      }),
    ).toBe(120);
    expect(
      projectDemand({
        baselinePrice: 50,
        candidatePrice: 60,
        baselineDemand: 0,
        elasticity: -1.4,
      }),
    ).toBe(0);
  });

  it("caps modeled sales at an explicit inventory constraint", () => {
    expect(
      projectDemand({
        baselinePrice: 100,
        candidatePrice: 80,
        baselineDemand: 100,
        elasticity: -1,
        inventoryLimit: 110,
      }),
    ).toBe(110);
  });

  it("returns a complete scenario with changes against current economics", () => {
    const scenario = projectScenario({
      id: "test",
      label: "Test",
      baselinePrice: 50,
      candidatePrice: 55,
      baselineDemand: 1_000,
      unitCost: 20,
      elasticity: -0.8,
    });

    expect(scenario.priceChangePercent).toBe(10);
    expect(scenario.demandChangePercent).toBeLessThan(0);
    expect(scenario.revenue).toBeGreaterThan(50_000);
    expect(scenario.contributionProfit).toBeGreaterThan(30_000);
    expect(scenario.marginPercent).toBeCloseTo(63.64, 2);
  });

  it("rejects invalid demand model parameters", () => {
    expect(() =>
      projectDemand({
        baselinePrice: 0,
        candidatePrice: 10,
        baselineDemand: 10,
        elasticity: -1,
      }),
    ).toThrow("baselinePrice must be greater than zero");
    expect(() =>
      projectDemand({
        baselinePrice: 10,
        candidatePrice: 11,
        baselineDemand: -1,
        elasticity: -1,
      }),
    ).toThrow("baselineDemand cannot be negative");
  });
});

describe("arc elasticity estimation", () => {
  it("recovers a known constant-elasticity signal from clean history", () => {
    const history = elasticityHistory(-1.3);
    const estimate = estimateArcElasticity(history);

    expect(estimate.elasticity).toBeCloseTo(-1.3, 1);
    expect(estimate.usablePairCount).toBe(11);
    expect(estimate.confidence).toBe("high");
    expect(estimate.limitations.some((item) => item.includes("not causation"))).toBe(true);
  });

  it("reports null and low confidence with no meaningful price variation", () => {
    const history = elasticityHistory(-1.2).map((observation) => ({
      ...observation,
      price: 100,
      unitsSold: 1_000,
    }));
    const estimate = estimateArcElasticity(history);

    expect(estimate.elasticity).toBeNull();
    expect(estimate.confidence).toBe("low");
    expect(estimate.confidenceScore).toBe(0);
    expect(estimate.limitations.join(" ")).toContain("price changes");
  });

  it("excludes promotional transitions and discloses that exclusion", () => {
    const history = elasticityHistory(-1).map((observation, index) => ({
      ...observation,
      isPromotion: index === 5,
    }));
    const estimate = estimateArcElasticity(history);

    expect(estimate.usablePairCount).toBe(9);
    expect(estimate.limitations.join(" ")).toContain("promotion effects");
  });

  it("rejects mixed-product history", () => {
    const history = elasticityHistory(-1);
    history[2] = { ...history[2], productId: "other" };
    expect(() => estimateArcElasticity(history)).toThrow("one product only");
  });

  it("interpolates an exact bimodal weighted median and surfaces disagreement", () => {
    const estimate = estimateArcElasticity(bimodalElasticityHistory());

    expect(estimate.elasticity).toBe(-1.75);
    expect(estimate.robustDispersion).toBe(1.25);
    expect(estimate.confidence).not.toBe("high");
    expect(estimate.limitations.join(" ")).toContain("vary substantially");
  });

  it("does not treat dense daily rows as long-run monthly evidence", () => {
    const daily = Array.from({ length: 18 }, (_, index) => {
      const price = 88 + index * 1.5;
      return {
        ...elasticityHistory(-1.2)[0],
        date: `2025-08-${String(index + 1).padStart(2, "0")}`,
        price,
        unitsSold: 1_000 * (price / 100) ** -1.2,
      };
    });
    const estimate = estimateArcElasticity(daily);
    const analysis = analyzeProduct(daily);

    expect(estimate.evidenceMonthCount).toBe(1);
    expect(estimate.confidence).toBe("low");
    expect(estimate.limitations.join(" ")).toContain("calendar months");
    expect(analysis.modeledElasticity).toBe(-1);
  });

  it("does not let promotion rows inflate the history score", () => {
    const history = elasticityHistory(-1.2).map((observation, index) => ({
      ...observation,
      isPromotion: index >= 5,
    }));
    const estimate = estimateArcElasticity(history);

    expect(estimate.usablePairCount).toBe(4);
    expect(estimate.evidenceMonthCount).toBe(5);
    expect(estimate.confidence).not.toBe("high");
  });
});

describe("price frontier optimization", () => {
  it("marks current, revenue-maximizing, and profit-maximizing prices", () => {
    const frontier = buildPriceFrontier({
      currentPrice: 100,
      baselineDemand: 1_000,
      unitCost: 30,
      elasticity: -1.5,
      minPrice: 70,
      maxPrice: 140,
      steps: 141,
    });

    expect(frontier.points.filter((point) => point.isCurrent)).toHaveLength(1);
    expect(frontier.points.filter((point) => point.isRevenueMaximum)).toHaveLength(1);
    expect(frontier.points.filter((point) => point.isProfitMaximum)).toHaveLength(1);
    expect(frontier.revenueMaximum.price).toBe(70);
    expect(frontier.profitMaximum.price).toBeCloseTo(90, 0);
    expect(frontier.profitMaximum.price).not.toBe(frontier.revenueMaximum.price);
  });

  it("selects current price for tied zero-demand outcomes", () => {
    const frontier = buildPriceFrontier({
      currentPrice: 50,
      baselineDemand: 0,
      unitCost: 20,
      elasticity: -1,
      minPrice: 40,
      maxPrice: 60,
    });
    expect(frontier.revenueMaximum.price).toBe(50);
    expect(frontier.profitMaximum.price).toBe(50);
  });

  it("does not invent a revenue maximum from rounded unit-elastic demand", () => {
    const frontier = buildPriceFrontier({
      currentPrice: 100,
      baselineDemand: 1_000,
      unitCost: 30,
      elasticity: -1,
      minPrice: 70,
      maxPrice: 140,
      steps: 71,
    });

    expect(new Set(frontier.points.map((point) => point.revenue))).toEqual(
      new Set([100_000]),
    );
    expect(frontier.revenueMaximum.price).toBe(100);
  });

  it("validates bounds and resolution", () => {
    expect(() =>
      buildPriceFrontier({
        currentPrice: 100,
        baselineDemand: 100,
        unitCost: 30,
        elasticity: -1,
        minPrice: 120,
        maxPrice: 80,
      }),
    ).toThrow("minPrice must be lower");
    expect(() =>
      buildPriceFrontier({
        currentPrice: 100,
        baselineDemand: 100,
        unitCost: 30,
        elasticity: -1,
        steps: 2,
      }),
    ).toThrow("steps must be an integer");
  });

  it("is deterministic", () => {
    const input = {
      currentPrice: 72,
      baselineDemand: 840,
      unitCost: 28,
      elasticity: -0.9,
    };
    expect(buildPriceFrontier(input)).toEqual(buildPriceFrontier(input));
  });
});

describe("decision analysis", () => {
  const model = {
    currentPrice: 100,
    baselineDemand: 1_000,
    unitCost: 60,
    elasticity: -1.5,
    minPrice: 70,
    maxPrice: 160,
    steps: 91,
  };

  it("creates four editable strategy scenarios", () => {
    const scenarios = generateScenarios(model, 108);
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "current",
      "conservative",
      "recommended",
      "aggressive",
    ]);
    expect(scenarios[0].priceChangePercent).toBe(0);
    expect(scenarios[2].price).toBe(108);
    expect(scenarios[3].price).toBeGreaterThan(108);
  });

  it("re-optimizes under less, expected, and more elastic assumptions", () => {
    const sensitivity = runSensitivityAnalysis(model);
    expect(sensitivity.map((item) => item.id)).toEqual(["low", "expected", "high"]);
    expect(sensitivity[0].elasticity).toBe(-1.125);
    expect(sensitivity[2].elasticity).toBe(-1.875);
    expect(sensitivity[0].recommendedPrice).toBeGreaterThanOrEqual(
      sensitivity[2].recommendedPrice,
    );
  });

  it("rejects nonsensical sensitivity bands", () => {
    expect(() => runSensitivityAnalysis(model, 1.5)).toThrow(
      "elasticityBand must be between zero and one",
    );
  });

  it("caps the first recommended move according to evidence confidence", () => {
    const frontier = buildPriceFrontier(model);
    const low = generateDecisionBrief(frontier, estimateStub("low", 0.2));
    const high = generateDecisionBrief(frontier, estimateStub("high", 0.9));

    expect(low.action).toBe("test_increase");
    expect(low.expectedImpact.pricePercent).toBe(5);
    expect(high.expectedImpact.pricePercent).toBe(12);
    expect(high.expectedImpact.profitPercent).toBeGreaterThan(0);
  });

  it("preserves an inventory cap when sizing the staged decision", () => {
    const frontier = buildPriceFrontier({ ...model, inventoryLimit: 500 });
    const brief = generateDecisionBrief(frontier, estimateStub("high", 0.9));

    expect(brief.expectedImpact.demandPercent).toBe(0);
    expect(frontier.points.every((point) => point.demand <= 500)).toBe(true);
  });

  it("turns a calculated decision into a safe experiment proposal", () => {
    const brief = generateDecisionBrief(
      buildPriceFrontier(model),
      estimateStub("medium", 0.6),
    );
    const experiment = proposePricingExperiment(brief);

    expect(experiment.status).toBe("proposed");
    expect(experiment.controlPrice).toBe(100);
    expect(experiment.treatmentPrice).toBe(108);
    expect(experiment.guardrails).toContain("Conversion rate");
    expect(experiment.rolloutGuidance).toContain("sample size");
  });

  it("recommends a material gain when current contribution profit is zero", () => {
    const frontier = buildPriceFrontier({
      currentPrice: 100,
      baselineDemand: 1_000,
      unitCost: 100,
      elasticity: -0.5,
    });
    const brief = generateDecisionBrief(frontier, estimateStub("high", 0.9));
    const experiment = proposePricingExperiment(brief);

    expect(brief.action).toBe("test_increase");
    expect(brief.expectedImpact.profitPercent).toBeNull();
    expect(brief.expectedImpact.profitAbsolute).toBeGreaterThan(0);
    expect(experiment.hypothesis).toContain("per modeled period");
  });

  it("describes a price decrease with the correct economic tradeoff", () => {
    const frontier = buildPriceFrontier({
      currentPrice: 100,
      baselineDemand: 1_000,
      unitCost: 30,
      elasticity: -2,
      minPrice: 60,
      maxPrice: 140,
    });
    const brief = generateDecisionBrief(frontier, estimateStub("high", 0.9));
    const experiment = proposePricingExperiment(brief);

    expect(brief.action).toBe("test_decrease");
    expect(brief.reasoning.join(" ")).toContain("lower contribution per unit");
    expect(brief.reasoning.join(" ")).not.toContain("added unit contribution");
    expect(experiment.hypothesis).toContain("price decrease");
    expect(experiment.hypothesis).not.toContain("by -");
  });
});

describe("data quality", () => {
  it("accepts valid observations without mutating them", () => {
    const history = elasticityHistory(-1);
    const snapshot = structuredClone(history);
    const result = validatePricingObservations(history);
    expect(result.valid).toBe(true);
    expect(history).toEqual(snapshot);
  });

  it("rejects malformed numeric values instead of coercing them", () => {
    const malformed = {
      ...elasticityHistory(-1)[0],
      price: "100",
      unitsSold: -2,
    };
    const result = validatePricingObservations([malformed]);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("invalid_number");
    expect(result.errors.map((error) => error.code)).toContain("negative_value");
  });

  it("rejects impossible dates, zero prices, and duplicate product-period rows", () => {
    const first = elasticityHistory(-1)[0];
    const result = validatePricingObservations([
      { ...first, date: "2025-02-30", price: 0 },
      first,
      { ...first },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("invalid_date");
    expect(result.errors.map((error) => error.code)).toContain("non_positive_price");
    expect(result.errors.map((error) => error.code)).toContain("duplicate_observation");
  });

  it("reports duplicate row indices against source rows after invalid input", () => {
    const first = elasticityHistory(-1)[0];
    const result = validatePricingObservations(["invalid", first, { ...first }]);
    const duplicate = result.errors.find((error) => error.code === "duplicate_observation");

    expect(duplicate?.rowIndex).toBe(2);
  });

  it("warns when cost exceeds price or history lacks variation", () => {
    const history = elasticityHistory(-1)
      .slice(0, 3)
      .map((observation) => ({ ...observation, price: 50, unitCost: 60 }));
    const result = validatePricingObservations(history);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain("cost_above_price");
    expect(result.warnings.map((warning) => warning.code)).toContain("insufficient_history");
    expect(result.warnings.map((warning) => warning.code)).toContain(
      "insufficient_price_variation",
    );
  });
});

describe("synthetic sample and integrated analysis", () => {
  it("ships five differentiated products with 24 complete monthly rows each", () => {
    expect(sampleProductProfiles).toHaveLength(5);
    expect(sampleObservations).toHaveLength(120);
    for (const product of sampleProductProfiles) {
      expect(
        sampleObservations.filter((row) => row.productId === product.productId),
      ).toHaveLength(24);
    }
    expect(SYNTHETIC_DATA_NOTICE.toLowerCase()).toContain("synthetic");
  });

  it("passes strict validation and includes useful seasonality and inventory patterns", () => {
    const validation = validatePricingObservations(sampleObservations);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const harborLatest = [...sampleObservations]
      .filter((row) => row.productId === "harbor-bottle")
      .sort((left, right) => left.date.localeCompare(right.date))
      .at(-1)!;
    expect(harborLatest.inventory / harborLatest.unitsSold).toBeGreaterThan(4);
    expect(new Set(sampleObservations.map((row) => row.seasonalIndex)).size).toBeGreaterThan(20);
  });

  it("produces a complete, calculation-backed product analysis", () => {
    const rows = sampleObservations.filter((row) => row.productId === "pulse-earbuds");
    const analysis = analyzeProduct(rows);

    expect(analysis.productName).toBe("Pulse Wireless Earbuds");
    expect(analysis.elasticityEstimate.elasticity).not.toBeNull();
    expect(analysis.frontier.points.length).toBeGreaterThanOrEqual(61);
    expect(analysis.scenarios).toHaveLength(4);
    expect(analysis.sensitivity).toHaveLength(3);
    expect(analysis.decisionBrief.recommendedPrice).toBe(
      analysis.scenarios.find((scenario) => scenario.id === "recommended")?.price,
    );
    expect(analysis.experiment.caveat.length).toBeGreaterThan(20);
  });

  it("keeps the documented Folio decision example reproducible", () => {
    const analysis = analyzeProduct(
      sampleObservations.filter((row) => row.productId === "folio-notebook"),
    );

    expect(analysis.elasticityEstimate.elasticity).toBe(-0.653);
    expect(analysis.frontier.currentPrice).toBe(20.34);
    expect(analysis.frontier.profitMaximum.price).toBe(28.48);
    expect(analysis.decisionBrief.recommendedPrice).toBe(22.78);
    expect(analysis.decisionBrief.expectedImpact.demandPercent).toBe(-7.13);
    expect(analysis.decisionBrief.expectedImpact.revenuePercent).toBe(4.01);
    expect(analysis.decisionBrief.expectedImpact.profitPercent).toBe(9.22);
  });

  it("uses a disclosed fallback when history cannot estimate elasticity", () => {
    const rows = elasticityHistory(-1).map((row) => ({
      ...row,
      price: 100,
      unitsSold: 1_000,
    }));
    const analysis = analyzeProduct(rows);

    expect(analysis.elasticityEstimate.elasticity).toBeNull();
    expect(analysis.modeledElasticity).toBe(-1);
    expect(analysis.dataWarnings.join(" ")).toContain("fallback");
  });

  it("does not use a non-negative observational estimate as a demand model", () => {
    const analysis = analyzeProduct(elasticityHistory(0.7));

    expect(analysis.elasticityEstimate.elasticity).toBeGreaterThanOrEqual(0);
    expect(analysis.elasticityEstimate.confidence).toBe("low");
    expect(analysis.modeledElasticity).toBe(-1);
    expect(analysis.dataWarnings.join(" ")).toContain("fallback");
  });

  it("retains a sparse diagnostic estimate but falls back for modeling", () => {
    const sparse = elasticityHistory(-1.4).slice(0, 3);
    const estimate = estimateArcElasticity(sparse);
    const analysis = analyzeProduct(sparse, { fallbackElasticity: -2 });

    expect(estimate.elasticity).toBeCloseTo(-1.4, 1);
    expect(estimate.usablePairCount).toBe(2);
    expect(estimate.confidence).toBe("low");
    expect(estimate.confidenceScore).toBeLessThan(0.45);
    expect(analysis.modeledElasticity).toBe(-2);
    expect(analysis.dataWarnings.join(" ")).toContain("configured -2.00 fallback");
  });

  it("derives portfolio totals and all opportunity categories from data", () => {
    const portfolio = analyzePortfolio(sampleObservations);
    expect(portfolio.productCount).toBe(5);
    expect(portfolio.observationCount).toBe(120);
    expect(portfolio.totalRevenue).toBeGreaterThan(0);
    expect(portfolio.totalContributionProfit).toBeGreaterThan(0);
    expect(portfolio.opportunities.map((opportunity) => opportunity.kind)).toEqual([
      "profit_upside",
      "elasticity_risk",
      "inventory",
      "confidence",
    ]);
    expect(portfolio.opportunities.find((item) => item.kind === "inventory")?.productId).toBe(
      "harbor-bottle",
    );
  });
});

function elasticityHistory(elasticity: number): PricingObservation[] {
  return Array.from({ length: 12 }, (_, index) => {
    const price = 88 + index * 2.4;
    return {
      date: `2025-${String(index + 1).padStart(2, "0")}-01`,
      productId: "known-product",
      productName: "Known Product",
      category: "Test",
      price,
      unitCost: 30,
      unitsSold: 1_000 * (price / 100) ** elasticity,
      inventory: 2_000,
      isPromotion: false,
      seasonalIndex: 1,
    };
  });
}

function estimateStub(
  confidence: ElasticityEstimate["confidence"],
  confidenceScore: number,
): ElasticityEstimate {
  return {
    elasticity: -1.5,
    confidence,
    confidenceScore,
    method: "test",
    observationCount: 24,
    evidenceMonthCount: 24,
    usablePairCount: 8,
    priceVariationPercent: 20,
    robustDispersion: 0.1,
    limitations: ["Test uncertainty remains."],
  };
}

function bimodalElasticityHistory(): PricingObservation[] {
  const elasticities = [-3, -3, -3, -0.5, -0.5, -0.5];
  const rows: PricingObservation[] = [];
  let monthOffset = 0;

  elasticities.forEach((elasticity, pairIndex) => {
    const arcPriceChange = 10 / 105;
    const arcDemandChange = elasticity * arcPriceChange;
    const firstDemand = 1_000 * (1 - arcDemandChange / 2);
    const secondDemand = 1_000 * (1 + arcDemandChange / 2);
    rows.push(
      testObservation(monthOffset, 100, firstDemand, false),
      testObservation(monthOffset + 1, 110, secondDemand, false),
    );
    monthOffset += 2;
    if (pairIndex < elasticities.length - 1) {
      rows.push(testObservation(monthOffset, 105, 1_000, true));
      monthOffset += 1;
    }
  });
  return rows;
}

function testObservation(
  monthOffset: number,
  price: number,
  unitsSold: number,
  isPromotion: boolean,
): PricingObservation {
  const date = new Date(Date.UTC(2024, monthOffset, 1));
  return {
    date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`,
    productId: "bimodal-product",
    productName: "Bimodal Product",
    category: "Test",
    price,
    unitCost: 30,
    unitsSold,
    inventory: 2_000,
    isPromotion,
    seasonalIndex: 1,
  };
}
