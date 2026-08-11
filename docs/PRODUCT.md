# Product

## Purpose

PricePilot helps commercial teams reason about price changes before exposing customers to them. It joins sales history, a transparent demand model, scenario comparison, and experiment design in one browser-based workbench.

Core question:

> If this product's price changes, what may happen to demand, revenue, margin, and contribution profit—and which candidate price is economically strongest under the stated assumptions?

## Target users

- Pricing and revenue teams evaluating list-price changes
- Product and category managers balancing growth, margin, and inventory
- Finance and operations teams reviewing unit economics
- Founders and commercial operators who need a compact, inspectable pricing model

PricePilot assumes users understand their commercial context and can judge constraints missing from transaction data.

## Jobs to be done

1. Understand catalog-wide performance without rebuilding metrics in a spreadsheet.
2. Diagnose one product's price, demand, margin, inventory, and evidence quality.
3. See why revenue-maximizing and profit-maximizing prices can differ.
4. Compare a small set of plausible strategies against the current state.
5. Test whether a recommendation survives weaker or stronger demand response.
6. Turn a modeled opportunity into a controlled experiment proposal.
7. Load familiar CSV data safely and understand rejected rows.

## Main workflows

### Review the product portfolio

The dashboard presents revenue, units, contribution profit, and contribution margin. Trend charts provide time context. Opportunity cards add modeled profit upside, price-sensitivity risk, inventory relative to recent demand, and evidence strength; they are computed from product analysis rather than written into the sample data.

### Investigate a product

Selecting a product opens its history, current economics, elasticity estimate, evidence caveats, and recommended candidate price. Observed metrics and modeled projections remain visually distinct.

### Explore the Price Frontier

PricePilot evaluates a bounded price grid around the baseline. Users can compare projected demand, revenue, and contribution profit and inspect the current, revenue-maximizing, and profit-maximizing points.

### Compare scenarios

Scenario Lab presents current, conservative, recommended, and aggressive prices side by side. Users can change price, elasticity, baseline demand, cost, and inventory assumptions and immediately see reconciled changes.

### Stress-test and act

Sensitivity analysis recomputes the preferred candidate under less elastic, expected, and more elastic assumptions. The decision brief stages the theoretical profit target according to evidence confidence, summarizes the calculated tradeoff, and names its primary limitation. An experiment proposal translates that result into a control, treatment, hypothesis, primary metric, and guardrails.

### Import data

CSV import detects common headers, supports manual field mapping, previews data, and validates every row. Valid rows can be loaded into the current session; invalid rows remain excluded and visible with actionable errors.

## Product principles

### Explain the tradeoff

PricePilot must show how it reached a result. A recommendation without its demand, revenue, profit, and uncertainty context is incomplete.

### Calculate once

Dashboard metrics, charts, briefs, and rankings use shared deterministic functions. Equivalent inputs must produce equivalent outputs everywhere.

### Separate observation from projection

Historical records are facts supplied by the dataset. Demand response and candidate outcomes are estimates. Labels and copy preserve that boundary.

### Surface weak evidence

Limited observations, low price variation, outliers, and missing context reduce confidence. PricePilot communicates those limits instead of manufacturing precision.

### Prefer action with guardrails

Recommendations lead to experiments, not declarations of certainty. Guardrail metrics protect demand and customer outcomes while the primary metric tests economic value.

### Work immediately

Synthetic sample data opens a meaningful analysis on first run. No account, service, or API key blocks the core loop.

## Success measures

These are product evaluation criteria, not reported operating metrics:

- Time from opening the app to understanding the strongest catalog-level opportunity
- Share of imports resolved without editing the source file
- Ability to reconcile every recommendation to visible scenario values
- Error rate between displayed metrics and shared model outputs
- Time required to compare multiple prices and produce a test proposal
- User recognition that model quality depends on data and assumptions

## MVP boundary

The MVP is a single-browser-session decision tool. It includes sample data, client-side CSV import, deterministic analysis, charts, opportunities, briefs, and experiment proposals. It does not include persistence, accounts, collaboration, live connectors, automated price changes, causal inference, or generative AI.
