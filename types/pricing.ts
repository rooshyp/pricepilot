/** Shared, dependency-free domain types for the PricePilot pricing engine. */

export type ConfidenceLevel = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

export interface PricingObservation {
  date: string;
  productId: string;
  productName: string;
  category: string;
  price: number;
  unitCost: number;
  unitsSold: number;
  inventory: number;
  isPromotion?: boolean;
  /** Demand multiplier for the observation's month. One means no seasonal effect. */
  seasonalIndex?: number;
  /** Optional deterministic context shown in product history and import previews. */
  note?: string;
}

export type DataIssueCode =
  | "invalid_collection"
  | "missing_field"
  | "invalid_value"
  | "invalid_date"
  | "invalid_number"
  | "negative_value"
  | "non_positive_price"
  | "invalid_seasonal_index"
  | "duplicate_observation"
  | "cost_above_price"
  | "insufficient_history"
  | "insufficient_price_variation"
  | "suspicious_outlier";

export interface DataIssue {
  code: DataIssueCode;
  severity: "error" | "warning";
  message: string;
  rowIndex?: number;
  productId?: string;
  field?: keyof PricingObservation;
}

export interface ObservationValidationResult {
  valid: boolean;
  observations: PricingObservation[];
  errors: DataIssue[];
  warnings: DataIssue[];
}

export interface PricingMetrics {
  price: number;
  demand: number;
  revenue: number;
  contributionProfit: number;
  marginPercent: number;
  markupPercent: number | null;
  unitContribution: number;
}

export interface DemandProjectionInput {
  baselinePrice: number;
  candidatePrice: number;
  baselineDemand: number;
  elasticity: number;
  /** Optional hard cap. Useful for user-entered inventory constraints. */
  inventoryLimit?: number;
}

export interface ScenarioModelInput extends DemandProjectionInput {
  unitCost: number;
  id?: string;
  label?: string;
}

export interface PricingScenario extends PricingMetrics {
  id: string;
  label: string;
  priceChangePercent: number;
  demandChangePercent: number;
  revenueChangePercent: number;
  profitChangePercent: number | null;
  risk: RiskLevel;
  isBaseline: boolean;
}

export interface ElasticityEstimate {
  /** Null means history cannot support a responsible estimate. */
  elasticity: number | null;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  method: string;
  observationCount: number;
  /** Distinct calendar months represented by valid, non-promotional evidence. */
  evidenceMonthCount: number;
  usablePairCount: number;
  priceVariationPercent: number;
  robustDispersion: number | null;
  limitations: string[];
}

export interface PriceFrontierInput {
  currentPrice: number;
  baselineDemand: number;
  unitCost: number;
  elasticity: number;
  minPrice?: number;
  maxPrice?: number;
  steps?: number;
  inventoryLimit?: number;
}

export interface PriceFrontierPoint extends PricingMetrics {
  priceChangePercent: number;
  demandChangePercent: number;
  revenueChangePercent: number;
  profitChangePercent: number | null;
  isCurrent: boolean;
  isRevenueMaximum: boolean;
  isProfitMaximum: boolean;
}

export interface PriceFrontier {
  currentPrice: number;
  baselineDemand: number;
  unitCost: number;
  inventoryLimit?: number;
  lowerBound: number;
  upperBound: number;
  elasticity: number;
  points: PriceFrontierPoint[];
  current: PriceFrontierPoint;
  revenueMaximum: PriceFrontierPoint;
  profitMaximum: PriceFrontierPoint;
}

export type SensitivityCaseId = "low" | "expected" | "high";

export interface SensitivityCase {
  id: SensitivityCaseId;
  label: string;
  elasticity: number;
  recommendedPrice: number;
  projectedDemand: number;
  projectedRevenue: number;
  projectedProfit: number;
  marginPercent: number;
  profitUpside: number;
  profitUpsidePercent: number | null;
}

export interface DecisionImpact {
  pricePercent: number;
  demandPercent: number;
  revenuePercent: number;
  profitPercent: number | null;
  revenueAbsolute: number;
  profitAbsolute: number;
}

export interface DecisionBrief {
  action: "test_increase" | "test_decrease" | "hold";
  headline: string;
  recommendation: string;
  currentPrice: number;
  recommendedPrice: number;
  expectedImpact: DecisionImpact;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  reasoning: string[];
  primaryRisk: string;
}

export interface ExperimentProposal {
  status: "proposed" | "not_recommended";
  controlPrice: number;
  treatmentPrice: number;
  primaryMetric: string;
  guardrails: string[];
  hypothesis: string;
  rolloutGuidance: string;
  stopConditions: string[];
  caveat: string;
}

export interface ProductPeriodSummary {
  observationCount: number;
  totalUnits: number;
  totalRevenue: number;
  totalContributionProfit: number;
  averageSellingPrice: number;
  contributionMarginPercent: number;
  priceLow: number;
  priceHigh: number;
}

export interface ProductAnalysis {
  productId: string;
  productName: string;
  category: string;
  observations: PricingObservation[];
  latestObservation: PricingObservation;
  periodSummary: ProductPeriodSummary;
  baselineDemand: number;
  currentMetrics: PricingMetrics;
  elasticityEstimate: ElasticityEstimate;
  /** Estimated negative elasticity, or a disclosed conservative fallback (default -1). */
  modeledElasticity: number;
  frontier: PriceFrontier;
  scenarios: PricingScenario[];
  sensitivity: SensitivityCase[];
  decisionBrief: DecisionBrief;
  experiment: ExperimentProposal;
  dataWarnings: string[];
}

export type OpportunityKind =
  | "profit_upside"
  | "elasticity_risk"
  | "inventory"
  | "confidence";

export interface PortfolioOpportunity {
  id: string;
  kind: OpportunityKind;
  productId: string;
  productName: string;
  title: string;
  insight: string;
  metricValue: number;
  metricLabel: string;
  priority: RiskLevel;
  confidence: ConfidenceLevel;
}

export interface PortfolioSummary {
  productCount: number;
  observationCount: number;
  totalUnits: number;
  totalRevenue: number;
  totalContributionProfit: number;
  contributionMarginPercent: number;
  averageSellingPrice: number;
  latestInventory: number;
  pricingOpportunityCount: number;
  analyses: ProductAnalysis[];
  opportunities: PortfolioOpportunity[];
}
