"use client";

import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Gauge,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { sentenceCase } from "@/lib/format";
import type { PortfolioOpportunity, PortfolioSummary } from "@/types/pricing";
import { ConfidenceBadge, SectionHeading } from "./ui";

const iconByKind = {
  profit_upside: Sparkles,
  elasticity_risk: ShieldAlert,
  inventory: Boxes,
  confidence: BadgeCheck,
};

function displayMetric(opportunity: PortfolioOpportunity) {
  return opportunity.metricLabel;
}

export function OpportunitiesView({
  summary,
  onSelectProduct,
}: {
  summary: PortfolioSummary;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="decision-hero">
        <div>
          <p className="eyebrow eyebrow--light">Executive decision queue</p>
          <h2>Turn signals into measured pricing moves.</h2>
          <p>
            Opportunities rank economic upside, evidence quality, and operational risk—so teams know what to investigate first.
          </p>
        </div>
        <div className="decision-hero__score">
          <span>Actionable signals</span>
          <strong>{summary.opportunities.length}</strong>
          <small>across {summary.productCount} products</small>
        </div>
      </section>

      <section className="opportunity-cards" aria-label="Pricing opportunities">
        {summary.opportunities.slice(0, 4).map((opportunity, index) => {
          const Icon = iconByKind[opportunity.kind];
          return (
            <article className={`opportunity-card opportunity-card--${opportunity.kind}`} key={opportunity.id}>
              <div className="opportunity-card__top">
                <span className="rank-label">0{index + 1}</span>
                <span className="opportunity-card__icon"><Icon size={18} /></span>
              </div>
              <p className="eyebrow">{sentenceCase(opportunity.kind)}</p>
              <h3>{opportunity.title}</h3>
              <p>{opportunity.insight}</p>
              <div className="opportunity-card__metric">
                <span>{opportunity.metricLabel}</span>
                <strong>{displayMetric(opportunity)}</strong>
              </div>
              <div className="opportunity-card__footer">
                <ConfidenceBadge level={opportunity.confidence} />
                <button className="row-arrow" aria-label={`Open ${opportunity.productName}`} onClick={() => onSelectProduct(opportunity.productId)}>
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel opportunity-register">
        <SectionHeading
          eyebrow="All signals"
          title="Opportunity register"
          description="Every finding below is derived from current observations and model outputs."
          action={<span className="table-summary"><Gauge size={15} /> Ranked by priority</span>}
        />
        <div className="opportunity-list">
          {summary.opportunities.map((opportunity, index) => {
            const Icon = iconByKind[opportunity.kind];
            return (
              <button
                key={opportunity.id}
                className="opportunity-row"
                onClick={() => onSelectProduct(opportunity.productId)}
              >
                <span className="opportunity-row__rank">{String(index + 1).padStart(2, "0")}</span>
                <span className={`opportunity-row__icon opportunity-row__icon--${opportunity.priority}`}><Icon size={17} /></span>
                <span className="opportunity-row__copy">
                  <strong>{opportunity.title}</strong>
                  <small>{opportunity.productName} · {opportunity.insight}</small>
                </span>
                <span className="opportunity-row__metric">
                  <small>{opportunity.metricLabel}</small>
                  <strong>{displayMetric(opportunity)}</strong>
                </span>
                <ConfidenceBadge level={opportunity.confidence} />
                <ArrowRight className="opportunity-row__arrow" size={16} />
              </button>
            );
          })}
        </div>
      </section>

      <p className="method-note">
        Opportunity ranks are directional decision support, not guarantees. Review confounders and validate material changes with controlled tests.
      </p>
    </div>
  );
}
