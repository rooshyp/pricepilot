"use client";

import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  Percent,
  Sparkles,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMargin, formatMonth, formatNumber, formatPercent } from "@/lib/format";
import type { PortfolioSummary, PricingObservation } from "@/types/pricing";
import { ChartTooltip, ConfidenceBadge, Delta, MetricCard, SectionHeading } from "./ui";

function groupTrend(observations: PricingObservation[]) {
  const dates = new Map<string, { date: string; revenue: number; profit: number; units: number }>();
  for (const observation of observations) {
    const point = dates.get(observation.date) ?? {
      date: observation.date,
      revenue: 0,
      profit: 0,
      units: 0,
    };
    point.revenue += observation.price * observation.unitsSold;
    point.profit += (observation.price - observation.unitCost) * observation.unitsSold;
    point.units += observation.unitsSold;
    dates.set(observation.date, point);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function change(current: number, previous: number) {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const opportunityMetricNames = {
  profit_upside: "Modeled upside",
  elasticity_risk: "Elasticity",
  inventory: "Inventory cover",
  confidence: "Confidence score",
};

export function Overview({
  summary,
  observations,
  onSelectProduct,
  onViewOpportunities,
}: {
  summary: PortfolioSummary;
  observations: PricingObservation[];
  onSelectProduct: (productId: string) => void;
  onViewOpportunities: () => void;
}) {
  const trend = groupTrend(observations);
  const current = trend.at(-1) ?? { revenue: 0, profit: 0, units: 0 };
  const previous = trend.at(-2) ?? current;
  const topOpportunity = summary.opportunities[0];
  const rankedProducts = [...summary.analyses].sort((a, b) => {
    const aUpside = a.decisionBrief.expectedImpact.profitAbsolute;
    const bUpside = b.decisionBrief.expectedImpact.profitAbsolute;
    return bUpside - aUpside;
  });

  return (
    <div className="view-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">Synthetic demo · Last 12 months</p>
          <h2>See where price can work harder.</h2>
          <p>
            Portfolio signals, modeled tradeoffs, and testable next moves—grounded in your data.
          </p>
        </div>
        <button className="button button--dark" onClick={onViewOpportunities}>
          Review decision queue <ArrowRight size={16} />
        </button>
      </section>

      <section className="metrics-grid" aria-label="Current portfolio metrics">
        <MetricCard
          label="Monthly revenue"
          value={formatCurrency(current.revenue, true)}
          trend={formatPercent(change(current.revenue, previous.revenue))}
          tone={current.revenue >= previous.revenue ? "positive" : "negative"}
          detail="vs. prior month"
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Contribution profit"
          value={formatCurrency(current.profit, true)}
          trend={formatPercent(change(current.profit, previous.profit))}
          tone={current.profit >= previous.profit ? "positive" : "negative"}
          detail="vs. prior month"
          icon={WalletCards}
        />
        <MetricCard
          label="Contribution margin"
          value={formatMargin(current.revenue ? current.profit / current.revenue : 0)}
          detail="current product mix"
          icon={Percent}
        />
        <MetricCard
          label="Units sold"
          value={formatNumber(current.units, true)}
          trend={formatPercent(change(current.units, previous.units))}
          tone={current.units >= previous.units ? "positive" : "negative"}
          detail="vs. prior month"
          icon={PackageCheck}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--chart dashboard-grid__trend">
          <SectionHeading
            eyebrow="Business performance"
            title="Revenue and profit trend"
            description="Monthly contribution economics across all active products."
            action={<span className="legend-label"><span className="legend-dot legend-dot--revenue" />Revenue <span className="legend-dot legend-dot--profit" />Profit</span>}
          />
          <div className="chart-frame chart-frame--large" role="img" aria-label="Monthly revenue and contribution profit chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#295e54" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#295e54" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9bb24d" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#9bb24d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e8e9e2" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonth} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 11 }} dy={8} />
                <YAxis tickFormatter={(value) => formatCurrency(value, true)} tickLine={false} axisLine={false} tick={{ fill: "#78817e", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip formatValue={(value) => formatCurrency(value, true)} />} cursor={{ stroke: "#aeb5ae", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#295e54" strokeWidth={2.4} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="profit" name="Profit" stroke="#9bb24d" strokeWidth={2.2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel opportunity-spotlight">
          <div className="opportunity-spotlight__icon"><Sparkles size={18} /></div>
          <p className="eyebrow">Highest-priority signal</p>
          <h3>{topOpportunity?.title ?? "No urgent pricing signal"}</h3>
          <p>{topOpportunity?.insight ?? "Current prices show no material modeled upside."}</p>
          {topOpportunity && (
            <>
              <div className="opportunity-spotlight__metric">
                <strong>{opportunityMetricNames[topOpportunity.kind]}</strong>
                <span>{topOpportunity.metricLabel}</span>
              </div>
              <ConfidenceBadge level={topOpportunity.confidence} />
              <button className="text-button" onClick={() => onSelectProduct(topOpportunity.productId)}>
                Open {topOpportunity.productName} <ArrowRight size={15} />
              </button>
            </>
          )}
        </article>
      </section>

      <section className="panel product-table-panel">
        <SectionHeading
          eyebrow="Product economics"
          title="Where pricing changes the outcome"
          description="Ranked by modeled contribution profit upside at each product’s recommended price."
          action={<span className="table-summary"><Boxes size={15} /> {summary.productCount} products</span>}
        />
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Current price</th>
                <th>Elasticity</th>
                <th>Recommended</th>
                <th>Profit impact</th>
                <th>Confidence</th>
                <th aria-label="Open product" />
              </tr>
            </thead>
            <tbody>
              {rankedProducts.map((product) => (
                <tr key={product.productId}>
                  <td>
                    <button className="product-cell" onClick={() => onSelectProduct(product.productId)}>
                      <span className="product-avatar">{product.productName.slice(0, 2).toUpperCase()}</span>
                      <span><strong>{product.productName}</strong><small>{product.category}</small></span>
                    </button>
                  </td>
                  <td>{formatCurrency(product.currentMetrics.price)}</td>
                  <td>
                    <span className="elasticity-value">
                      {product.elasticityEstimate.elasticity?.toFixed(2) ?? "Insufficient data"}
                    </span>
                  </td>
                  <td><strong>{formatCurrency(product.decisionBrief.recommendedPrice)}</strong></td>
                  <td><Delta value={product.decisionBrief.expectedImpact.profitPercent ?? 0} /></td>
                  <td><ConfidenceBadge level={product.decisionBrief.confidence} /></td>
                  <td>
                    <button className="row-arrow" aria-label={`Analyze ${product.productName}`} onClick={() => onSelectProduct(product.productId)}>
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="trust-strip">
        <div><TrendingUp size={18} /><span><strong>Explainable by design</strong> Every recommendation traces to observable inputs.</span></div>
        <div><Percent size={18} /><span><strong>Profit-aware</strong> Revenue and margin tradeoffs stay visible.</span></div>
        <div><Sparkles size={18} /><span><strong>Honest uncertainty</strong> Low-evidence estimates are labeled, never hidden.</span></div>
      </section>
    </div>
  );
}
