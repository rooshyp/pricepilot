"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  FlaskConical,
  Gauge,
  Info,
  Package,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  generateDecisionBrief,
  proposePricingExperiment,
  runSensitivityAnalysis,
} from "@/lib/analysis";
import { buildPriceFrontier, projectScenario } from "@/lib/economics";
import {
  formatCurrency,
  formatMargin,
  formatMonth,
  formatNumber,
} from "@/lib/format";
import type { PricingScenario, ProductAnalysis as ProductAnalysisType } from "@/types/pricing";
import { ChartTooltip, ConfidenceBadge, Delta, MetricCard, SectionHeading } from "./ui";

const scenarioTone: Record<string, string> = {
  current: "current",
  conservative: "conservative",
  recommended: "recommended",
  aggressive: "aggressive",
};

function buildHistory(product: ProductAnalysisType) {
  return product.observations.map((observation) => ({
    date: observation.date,
    price: observation.price,
    units: observation.unitsSold,
    revenue: observation.price * observation.unitsSold,
    profit: (observation.price - observation.unitCost) * observation.unitsSold,
    promotion: observation.isPromotion,
  }));
}

export function ProductAnalysis({
  product,
  products,
  onSelectProduct,
  onBack,
}: {
  product: ProductAnalysisType;
  products: ProductAnalysisType[];
  onSelectProduct: (productId: string) => void;
  onBack: () => void;
}) {
  const [elasticity, setElasticity] = useState(product.modeledElasticity);
  const [baselineDemand, setBaselineDemand] = useState(Math.round(product.baselineDemand));
  const [unitCost, setUnitCost] = useState(product.latestObservation.unitCost);
  const [inventoryLimit, setInventoryLimit] = useState<number | undefined>(undefined);
  const [scenarioPrices, setScenarioPrices] = useState<Record<string, number>>(
    Object.fromEntries(product.scenarios.map((scenario) => [scenario.id, scenario.price])),
  );

  const modelInput = useMemo(
    () => ({
      currentPrice: product.currentMetrics.price,
      baselineDemand: Math.max(0, baselineDemand),
      unitCost: Math.max(0, unitCost),
      elasticity: Math.min(-0.05, elasticity),
      inventoryLimit,
      steps: 81,
    }),
    [product.currentMetrics.price, baselineDemand, unitCost, elasticity, inventoryLimit],
  );

  const frontier = useMemo(() => buildPriceFrontier(modelInput), [modelInput]);
  const brief = useMemo(
    () => generateDecisionBrief(frontier, product.elasticityEstimate),
    [frontier, product.elasticityEstimate],
  );
  const sensitivity = useMemo(() => runSensitivityAnalysis(modelInput), [modelInput]);
  const experiment = useMemo(() => proposePricingExperiment(brief), [brief]);
  const scenarios = useMemo(
    () =>
      product.scenarios.map((scenario) =>
        projectScenario({
          id: scenario.id,
          label: scenario.label,
          baselinePrice: product.currentMetrics.price,
          candidatePrice: Math.max(0.01, scenarioPrices[scenario.id] ?? scenario.price),
          baselineDemand: Math.max(0, baselineDemand),
          unitCost: Math.max(0, unitCost),
          elasticity: Math.min(-0.05, elasticity),
          inventoryLimit,
        }),
      ),
    [product.scenarios, product.currentMetrics.price, scenarioPrices, baselineDemand, unitCost, elasticity, inventoryLimit],
  );
  const history = useMemo(() => buildHistory(product), [product]);

  const resetAssumptions = () => {
    setElasticity(product.modeledElasticity);
    setBaselineDemand(Math.round(product.baselineDemand));
    setUnitCost(product.latestObservation.unitCost);
    setInventoryLimit(undefined);
    setScenarioPrices(Object.fromEntries(product.scenarios.map((scenario) => [scenario.id, scenario.price])));
  };

  return (
    <div className="view-stack product-view">
      <section className="product-header">
        <div className="product-header__main">
          <button className="back-button" onClick={onBack}><ArrowLeft size={15} /> All products</button>
          <div className="product-header__identity">
            <span className="product-header__avatar">{product.productName.slice(0, 2).toUpperCase()}</span>
            <div>
              <p>{product.category} · {product.productId}</p>
              <h2>{product.productName}</h2>
            </div>
          </div>
        </div>
        <div className="product-header__actions">
          <label className="product-select-label">
            <span>Switch product</span>
            <select value={product.productId} onChange={(event) => onSelectProduct(event.target.value)}>
              {products.map((item) => <option key={item.productId} value={item.productId}>{item.productName}</option>)}
            </select>
          </label>
          <ConfidenceBadge level={product.elasticityEstimate.confidence} />
        </div>
      </section>

      <section className="metrics-grid product-metrics" aria-label="Current product metrics">
        <MetricCard label="Current price" value={formatCurrency(product.currentMetrics.price)} detail={`Cost ${formatCurrency(product.latestObservation.unitCost)}`} icon={CircleDollarSign} />
        <MetricCard label="Baseline demand" value={formatNumber(product.baselineDemand)} detail="seasonally adjusted units" icon={Package} />
        <MetricCard label="Contribution margin" value={formatMargin(product.currentMetrics.marginPercent / 100)} detail={`${formatCurrency(product.currentMetrics.unitContribution)} per unit`} icon={Gauge} />
        <MetricCard label="Estimated elasticity" value={product.elasticityEstimate.elasticity?.toFixed(2) ?? "N/A"} detail={`${product.elasticityEstimate.usablePairCount} usable price moves`} icon={TrendingUp} />
      </section>

      <section className="panel decision-brief">
        <div className="decision-brief__lead">
          <span className="decision-brief__icon"><Sparkles size={18} /></span>
          <div>
            <p className="eyebrow">Pricing decision</p>
            <h2>{brief.headline}</h2>
            <p>{brief.recommendation}</p>
          </div>
        </div>
        <div className="impact-strip">
          <div><span>Demand</span><Delta value={brief.expectedImpact.demandPercent} /></div>
          <div><span>Revenue</span><Delta value={brief.expectedImpact.revenuePercent} /></div>
          <div><span>Profit</span><Delta value={brief.expectedImpact.profitPercent ?? 0} /></div>
          <div><span>Test price</span><strong>{formatCurrency(brief.recommendedPrice)}</strong></div>
        </div>
        <div className="decision-brief__reasoning">
          <div>
            <h3>Why this move</h3>
            <ul>{brief.reasoning.map((reason) => <li key={reason}><Check size={13} />{reason}</li>)}</ul>
          </div>
          <div className="risk-note">
            <AlertTriangle size={16} />
            <div><strong>Primary risk</strong><p>{brief.primaryRisk}</p></div>
          </div>
        </div>
      </section>

      <section className="model-layout">
        <article className="panel frontier-panel">
          <SectionHeading
            eyebrow="Signature model"
            title="Price Frontier"
            description="See why revenue-maximizing and profit-maximizing prices can diverge."
            action={<span className="model-live"><span /> Live model</span>}
          />
          <div className="frontier-highlights">
            <FrontierHighlight label="Current" value={frontier.current.price} tone="current" />
            <FrontierHighlight label="Revenue maximum" value={frontier.revenueMaximum.price} tone="revenue" />
            <FrontierHighlight label="Profit maximum" value={frontier.profitMaximum.price} tone="profit" />
          </div>
          <div className="chart-frame chart-frame--frontier" role="img" aria-label="Modeled revenue and profit across candidate prices">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={frontier.points} margin={{ top: 14, right: 8, left: -12, bottom: 2 }}>
                <defs>
                  <linearGradient id="frontierRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#456f96" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#456f96" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e8e9e2" strokeDasharray="3 5" vertical={false} />
                <XAxis type="number" dataKey="price" domain={[frontier.lowerBound, frontier.upperBound]} tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 10 }} />
                <YAxis tickFormatter={(value) => formatCurrency(value, true)} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 10 }} />
                <Tooltip content={<ChartTooltip formatValue={(value, name) => name === "Demand" ? formatNumber(value) : formatCurrency(value, true)} />} cursor={{ stroke: "#9aa49f", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" fill="url(#frontierRevenue)" stroke="#456f96" strokeWidth={2} />
                <Line type="monotone" dataKey="contributionProfit" name="Profit" stroke="#2d6c5e" strokeWidth={2.5} dot={false} />
                <ReferenceLine x={frontier.current.price} stroke="#78817e" strokeDasharray="3 3" label={{ value: "Current", position: "insideTopLeft", fill: "#78817e", fontSize: 9 }} />
                <ReferenceLine x={frontier.revenueMaximum.price} stroke="#456f96" strokeDasharray="5 4" />
                <ReferenceLine x={frontier.profitMaximum.price} stroke="#9bb24d" strokeDasharray="5 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="chart-footnote"><Info size={12} /> Constant-elasticity projection within a bounded ±30–40% price range; not a causal forecast.</p>
        </article>

        <aside className="panel assumptions-panel">
          <SectionHeading eyebrow="Model controls" title="Assumptions" description="Stress-test the frontier in real time." />
          <div className="assumption-list">
            <AssumptionControl
              label="Elasticity"
              value={elasticity}
              display={elasticity.toFixed(2)}
              min={-3}
              max={-0.1}
              step={0.05}
              onChange={setElasticity}
              helper="More negative = more price-sensitive"
            />
            <AssumptionControl
              label="Baseline demand"
              value={baselineDemand}
              display={formatNumber(baselineDemand)}
              min={0}
              max={Math.max(500, Math.round(product.baselineDemand * 2))}
              step={10}
              onChange={setBaselineDemand}
              helper="Expected units at current price"
            />
            <AssumptionControl
              label="Unit cost"
              value={unitCost}
              display={formatCurrency(unitCost)}
              min={0}
              max={Math.max(1, product.currentMetrics.price * 0.98)}
              step={0.1}
              onChange={setUnitCost}
              helper="Variable contribution cost"
            />
          </div>
          <div className="inventory-control">
            <label htmlFor="inventory-limit"><strong>Inventory constraint</strong><small>Optional demand cap</small></label>
            <input
              id="inventory-limit"
              type="number"
              min="0"
              placeholder="No cap"
              value={inventoryLimit ?? ""}
              onChange={(event) => setInventoryLimit(event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)))}
            />
          </div>
          <button className="reset-button" onClick={resetAssumptions}><RefreshCcw size={14} /> Reset assumptions</button>
        </aside>
      </section>

      <section className="panel scenario-lab">
        <SectionHeading
          eyebrow="Strategy comparison"
          title="Scenario Lab"
          description="Edit a price in any scenario. Demand, revenue, profit, and risk recalculate instantly."
          action={<span className="table-summary"><BarChart3 size={15} /> Compared with current</span>}
        />
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onPriceChange={(price) => setScenarioPrices((current) => ({ ...current, [scenario.id]: price }))}
            />
          ))}
        </div>
      </section>

      <section className="analysis-grid">
        <article className="panel history-panel">
          <SectionHeading eyebrow="Observed history" title="Price and demand" description="Monthly observations; promotion periods are retained in context." />
          <div className="chart-frame" role="img" aria-label="Historical price and units sold chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 12, right: 2, left: -18, bottom: 2 }}>
                <CartesianGrid stroke="#e8e9e2" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonth} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 10 }} minTickGap={22} />
                <YAxis yAxisId="units" tickFormatter={(value) => formatNumber(value, true)} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 10 }} />
                <YAxis yAxisId="price" orientation="right" tickFormatter={(value) => `$${value}`} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 10 }} />
                <Tooltip content={<ChartTooltip formatValue={(value, name) => name === "Price" ? formatCurrency(value) : formatNumber(value)} />} />
                <Line yAxisId="units" type="monotone" dataKey="units" name="Units" stroke="#2d6c5e" strokeWidth={2.2} dot={false} />
                <Line yAxisId="price" type="stepAfter" dataKey="price" name="Price" stroke="#a98143" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel sensitivity-panel">
          <SectionHeading eyebrow="Uncertainty" title="Sensitivity analysis" description="How the profit-optimal price shifts when elasticity is wrong by 25%." />
          <div className="sensitivity-list">
            {sensitivity.map((item) => {
              const maxUpside = Math.max(...sensitivity.map((entry) => Math.max(0, entry.profitUpside)), 1);
              return (
                <div className={`sensitivity-row sensitivity-row--${item.id}`} key={item.id}>
                  <div className="sensitivity-row__label"><strong>{item.label}</strong><span>e = {item.elasticity.toFixed(2)}</span></div>
                  <div className="sensitivity-row__bar"><span style={{ width: `${Math.max(5, (Math.max(0, item.profitUpside) / maxUpside) * 100)}%` }} /></div>
                  <div className="sensitivity-row__value"><strong>{formatCurrency(item.recommendedPrice)}</strong><span>{formatCurrency(item.profitUpside, true)} upside</span></div>
                </div>
              );
            })}
          </div>
          <p className="chart-footnote"><ShieldCheck size={12} /> Wide price movement across cases signals a fragile recommendation.</p>
        </article>
      </section>

      <section className="experiment-layout">
        <article className="panel experiment-card">
          <div className="experiment-card__header">
            <span><FlaskConical size={19} /></span>
            <div><p className="eyebrow">Suggested pricing test</p><h2>{experiment.status === "proposed" ? "Validate before rollout" : "Gather evidence first"}</h2></div>
          </div>
          <div className="test-prices">
            <div><span>Control</span><strong>{formatCurrency(experiment.controlPrice)}</strong><small>Current price</small></div>
            <ArrowRight size={18} />
            <div><span>Treatment</span><strong>{formatCurrency(experiment.treatmentPrice)}</strong><small>Proposed price</small></div>
          </div>
          <div className="hypothesis"><strong>Hypothesis</strong><p>{experiment.hypothesis}</p></div>
          <div className="experiment-details">
            <div><strong>Primary metric</strong><p>{experiment.primaryMetric}</p></div>
            <div><strong>Guardrails</strong><div className="guardrail-list">{experiment.guardrails.map((guardrail) => <span key={guardrail}>{guardrail}</span>)}</div></div>
          </div>
        </article>

        <aside className="panel evidence-card">
          <span className="evidence-card__icon"><Target size={18} /></span>
          <p className="eyebrow">Evidence quality</p>
          <h3>{Math.round(product.elasticityEstimate.confidenceScore * 100)}/100</h3>
          <ConfidenceBadge level={product.elasticityEstimate.confidence} />
          <dl>
            <div><dt>Observations</dt><dd>{product.elasticityEstimate.observationCount}</dd></div>
            <div><dt>Usable price moves</dt><dd>{product.elasticityEstimate.usablePairCount}</dd></div>
            <div><dt>Price variation</dt><dd>{product.elasticityEstimate.priceVariationPercent.toFixed(1)}%</dd></div>
          </dl>
          <details>
            <summary>Model limitations</summary>
            <ul>{product.dataWarnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details>
        </aside>
      </section>
    </div>
  );
}

function FrontierHighlight({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`frontier-highlight frontier-highlight--${tone}`}><span><i />{label}</span><strong>{formatCurrency(value)}</strong></div>;
}

function AssumptionControl({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  helper,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  helper: string;
}) {
  return (
    <label className="assumption-control">
      <span><strong>{label}</strong><b>{display}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <small>{helper}</small>
    </label>
  );
}

function ScenarioCard({ scenario, onPriceChange }: { scenario: PricingScenario; onPriceChange: (price: number) => void }) {
  const tone = scenarioTone[scenario.id] ?? "current";
  return (
    <article className={`scenario-card scenario-card--${tone}`}>
      <header><span>{scenario.label}</span><span className={`risk-pill risk-pill--${scenario.risk}`}>{scenario.risk} risk</span></header>
      <label><span>Price</span><span className="price-input"><i>$</i><input type="number" min="0.01" step="0.25" value={scenario.price} onChange={(event) => onPriceChange(Math.max(0.01, Number(event.target.value)))} aria-label={`${scenario.label} price`} /></span></label>
      <dl>
        <div><dt>Projected demand</dt><dd>{formatNumber(scenario.demand)} <Delta value={scenario.demandChangePercent} /></dd></div>
        <div><dt>Revenue</dt><dd>{formatCurrency(scenario.revenue, true)} <Delta value={scenario.revenueChangePercent} /></dd></div>
        <div><dt>Contribution profit</dt><dd>{formatCurrency(scenario.contributionProfit, true)} <Delta value={scenario.profitChangePercent ?? 0} /></dd></div>
        <div><dt>Margin</dt><dd>{scenario.marginPercent.toFixed(1)}%</dd></div>
      </dl>
    </article>
  );
}
