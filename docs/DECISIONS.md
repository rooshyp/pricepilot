# Product and engineering decisions

This log records consequential MVP choices. Status for each entry is **Accepted**.

## 001 — Deterministic calculations are the source of truth

**Context:** Pricing outputs must reconcile across charts, tables, recommendations, and tests.

**Decision:** Use pure TypeScript functions for every economic value and assemble decision-brief text from those outputs. Do not use generative AI in the MVP.

**Consequences:** Results are reproducible, inspectable, and available offline after load. Explanations are less stylistically flexible but cannot invent unsupported numbers.

## 002 — Optimize revenue and contribution profit separately

**Context:** Revenue peaks where price times demand is greatest; contribution profit also depends on unit cost.

**Decision:** Price Frontier calculates and labels separate revenue-maximizing and profit-maximizing candidate prices.

**Consequences:** Users see the core economic tradeoff. Documentation and UI use `profit` only as shorthand for contribution profit.

## 003 — Use a constant-elasticity demand curve

**Context:** Scenario modeling needs a stable, explainable mapping from price to demand.

**Decision:** Project quantity with `Q1 = Q0 * (P1 / P0) ^ e`. Estimate `e` from midpoint elasticity across valid adjacent, non-promotional observations, then use a robust weighted median when evidence permits.

**Consequences:** Percentage interpretation is clear and quantity remains non-negative. Large extrapolations, nonlinear behavior, confounding, and stockouts remain important limits.

## 004 — Use bounded grid search

**Context:** Closed-form optima depend on model assumptions and become awkward when guardrails or constraints change.

**Decision:** Evaluate a deterministic, bounded set of candidate prices and select maxima from computed scenarios. Treat the profit maximum as a theoretical target, then cap the first recommended test move by evidence confidence.

**Consequences:** One candidate set powers charts and recommendations. Results are discrete and only optimal within the evaluated range; boundary outcomes need scrutiny. Low-confidence evidence cannot produce a large first-step recommendation.

## 005 — Show uncertainty instead of hiding it

**Context:** Historical elasticity can appear precise even with weak price variation or missing context.

**Decision:** Surface evidence quality and limitations, provide low/expected/high elasticity stress cases, and lead recommendations to an experiment proposal.

**Consequences:** Users receive fewer absolute claims and more decision context. Sensitivity cases are explicitly not statistical confidence intervals.

## 006 — Keep the MVP client-side and ephemeral

**Context:** Core value can be tested without accounts, synchronization, or a data service.

**Decision:** Keep sample and imported data in browser memory. Add no persistence layer or network upload path.

**Consequences:** Setup is small, imported data stays local, and no secrets are required. Refresh clears imported records, and shared workspaces are unavailable.

## 007 — Validate before analysis

**Context:** CSV files are untrusted and malformed values can silently corrupt aggregate metrics.

**Decision:** Map headers, normalize values, validate at runtime, and pass only typed valid records to analysis. Structural parse errors stop import; mixed row-quality files may import valid rows with rejected rows disclosed.

**Consequences:** Partial imports remain useful without concealing loss. Users must resolve missing mappings and understand excluded rows before trusting results.

## 008 — Bundle explicit synthetic data

**Context:** The product must be useful immediately, but real commercial records cannot be bundled responsibly.

**Decision:** Ship a synthetic multi-product dataset with deliberately varied price response, margin, inventory, and time patterns. Label it as synthetic wherever provenance matters.

**Consequences:** Every core view has meaningful first-run data. Sample results demonstrate model behavior and make no claim about a real business.

## 009 — Derive opportunities and narrative from shared outputs

**Context:** Hardcoded insight cards drift from displayed metrics and can mislead users.

**Decision:** Rank opportunities and construct brief statements from current analysis results.

**Consequences:** Imported data changes all findings coherently. Copy is intentionally structured and bounded by available calculations.

## 010 — Keep observed and modeled metrics distinct

**Context:** Mixing historical totals with projected scenarios makes causal interpretation easy to overstate.

**Decision:** Calculate historical metrics only from input rows. Label candidate demand, revenue, and profit as projections.

**Consequences:** Users can audit what came from data and what came from assumptions. Interfaces spend additional space on labels and caveats.
