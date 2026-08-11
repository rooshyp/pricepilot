# Economic model

## Scope

PricePilot models unit economics and a local relationship between price and demand. It is a deterministic decision-support model, not a causal forecasting system. Identical validated inputs produce identical outputs.

Unless noted otherwise, `profit` in the interface means **contribution profit**. Fixed costs, taxes, returns, payment fees, and other absent costs are outside the model.

## Variables

- `P0`: baseline price
- `P1`: candidate price
- `C`: unit cost
- `Q0`: baseline quantity for the modeled period
- `Q1`: projected quantity at `P1`
- `e`: price elasticity of demand, normally negative
- `R`: revenue
- `Pi`: contribution profit
- `M`: contribution margin rate

Inputs use one currency and one consistent sales period per dataset. PricePilot does not perform currency conversion or period normalization.

Ratio formulas below are written as decimal rates. Percentage outputs multiply the rate by `100` and round to two decimal places.

## Core formulas

### Revenue

```text
R = P * Q
```

### Contribution profit

```text
Pi = (P - C) * Q
```

A candidate below unit cost can produce negative contribution profit. PricePilot preserves that result rather than converting it to zero.

### Contribution margin

```text
M = Pi / R = (P - C) / P
```

Margin returns `0` when revenue and contribution profit are both zero; it is undefined when revenue is zero but profit is not. Aggregated margin uses total contribution profit divided by total revenue, not an unweighted mean of row percentages.

### Relative change

```text
change(current, candidate) = (candidate - current) / abs(current)
```

Relative change returns `0` when both values are zero and is undefined when a zero baseline changes. Display logic handles that state explicitly instead of emitting infinity.

## Demand projection

PricePilot uses a constant-elasticity demand curve:

```text
Q1 = Q0 * (P1 / P0) ^ e
```

For `e < 0`, a higher candidate price reduces projected demand and a lower price increases it. The formulation keeps projected demand non-negative and compounds price changes consistently. `P0` and `P1` must be positive; `Q0` must be non-negative.

This curve is best interpreted locally. Behavior far outside the observed price range may differ materially.

## Elasticity estimation

Observations are ordered by date. For each usable adjacent, non-promotional pair `a` and `b`, PricePilot calculates midpoint percentage changes:

```text
quantity change = (Q_b - Q_a) / ((Q_b + Q_a) / 2)
price change    = (P_b - P_a) / ((P_b + P_a) / 2)
pair elasticity = quantity change / price change
```

Seasonal indices, when present, normalize quantity before pair comparison. Pairs with unusable demand, less than 1% midpoint price movement, a promotion on either observation, non-finite results, or absolute elasticity above `8` are excluded.

The product estimate is a robust weighted median of usable pair elasticities. Pair weight is `absolute price change * square root of midpoint demand`, giving more information-bearing movements greater influence while limiting scale dominance. The median reduces the effect of any one pair. This is more defensive than fitting one slope through a small, noisy history, but it does not remove confounding.

One usable pair can produce a diagnostic estimate, but fewer than four meaningful pairs, fewer than 12 distinct calendar months of valid non-promotional evidence, or less than 5% overall price spread trigger explicit limitations. Multiple rows in one month count once, and promotional rows do not add evidence months. Price spread is `(maximum price - minimum price) / mean price`. With no usable pair, the observed estimate is null.

An observed estimate is eligible for scenario modeling only when it is negative, has at least four usable pairs, represents at least four evidence months, and has medium or high confidence. Other estimates remain visible as diagnostics but are not treated as causal demand response. Ineligible estimates use a disclosed scenario fallback of `-1.0` by default; the fallback is not presented as an observed estimate.

Evidence quality uses a bounded heuristic:

```text
pair score      = min(1, usable pairs / 6)
variation score = min(1, price spread percent / 15)
stability score = max(0, 1 - min(1, dispersion / max(0.5, abs(e))))
history score   = min(1, evidence months / 18)

confidence score = 0.35 * pair score
                 + 0.30 * variation score
                 + 0.25 * stability score
                 + 0.10 * history score
```

A non-negative elasticity scales the result by `0.35` because it conflicts with the usual demand relationship. Fewer than four usable pairs or fewer than four evidence months hard-cap the score at `0.44`, ensuring low confidence. Fewer than 12 evidence months or less than 5% price spread cap it at `0.74`, preventing high confidence. Scores below `0.45` are low confidence, scores from `0.45` to below `0.75` are medium, and scores of `0.75` or more are high. Missing seasonal indices add a limitation but do not directly alter the score. This heuristic is an evidence communication aid, not a probability or statistical guarantee.

## Baseline

Product analysis anchors price, unit cost, inventory, and seasonal context to the latest valid observation. Demand uses up to the four most recent non-promotional observations when at least three exist; otherwise it uses up to the four most recent observations. Each quantity is seasonally normalized, repriced to the latest price with the modeled elasticity, restored to the latest seasonal context, and averaged with recency weights `1` through `n`. Baseline definitions remain consistent across the frontier, scenarios, sensitivity view, decision brief, and experiment proposal.

Historical catalog metrics are calculated directly from rows:

```text
row revenue = price * unitsSold
row contribution profit = (price - unitCost) * unitsSold
```

No modeled quantity is mixed into historical totals.

## Candidate evaluation

For every candidate price, the engine:

1. projects demand with the selected elasticity;
2. applies any explicit inventory constraint;
3. calculates revenue, contribution profit, and margin;
4. calculates absolute and relative changes from the baseline;
5. retains the complete result for charts and comparison.

The engine default is 61 evenly spaced candidates; the interactive product workbench requests 81 for its chart. The lower bound is the greater of `$0.01`, 70% of the current price, and 101% of unit cost, capped at the current price so the baseline remains in range. The upper bound is the greater of 140% of current price and 120% of unit cost. The exact current price is included even when it does not fall on a generated step. Custom grids allow 5 through 401 steps. The candidate with greatest revenue is the revenue-maximizing point; the candidate with greatest contribution profit is the profit-maximizing point. Ties prefer the price closest to the current price, then the lower price.

Grid-search results are discrete and range-bound:

- They identify the strongest evaluated candidate, not a global mathematical optimum.
- A boundary result suggests the search range may be too narrow or the assumptions may be unrealistic.
- Candidate prices use two decimal places. Raw projected demand feeds the revenue and contribution-profit formulas; those monetary objectives round to cents before maxima are selected. Displayed demand rounds to two decimal places. This avoids quantity-rounding artifacts while preserving currency semantics.

Scenario risk is a deterministic exposure label:

```text
exposure = abs(price change percent)
         * (1 + max(0, abs(e) - 1) * 0.5)
```

Exposure above `18` is high risk, above `8` is medium risk, and all other values are low risk. This is a relative model warning, not a probability of failure.

## Recommendation

The theoretical target is the profit-maximizing frontier point. To keep the first test proportional to evidence, PricePilot caps the move from current price at 5% for low confidence, 8% for medium confidence, and 12% for high confidence. It recommends holding when the staged move is below 0.75% or lacks a material modeled profit improvement. With non-zero baseline profit, improvement must exceed 0.5%. When baseline profit is zero and percentage change is undefined, absolute profit gain must exceed the greater of `$0.01` and 0.5% of baseline revenue; the brief reports that absolute gain.

Brief text is assembled from actual scenario values. It reports:

- baseline and recommended price;
- projected demand change;
- projected revenue and contribution-profit change;
- economic rationale;
- strongest detected limitation;
- confidence or evidence quality.

Derived catalog opportunities use the same product outputs. They rank economic upside, elasticity risk, inventory context, and evidence quality; no opportunity values are embedded as narrative constants.

## Sensitivity analysis

Sensitivity analysis varies `e` while holding baseline inputs constant. The three default cases use `0.75 * e`, `e`, and `1.25 * e` for less elastic, expected, and more elastic demand. Each assumption reruns the full candidate search, so both projected profit and preferred price can change. The elasticity-band input is limited to `0` through `1`.

The low, expected, and high response cases represent alternative assumptions, not confidence-interval endpoints. Their purpose is to reveal whether a recommendation is robust to plausible misspecification.

## Experiment proposal

The experiment proposal uses current price as control and recommended price as treatment. Its hypothesis and expected direction come from the modeled comparison. Suggested measurement:

- Primary metric: contribution profit per eligible customer
- Guardrails: conversion rate, units per order, refund rate, and customer complaints

PricePilot does not assign traffic, calculate statistical power, randomize customers, or measure experiment results in the MVP. It deliberately leaves sample size and duration to actual traffic, variance, and a pre-registered minimum detectable effect.

## Input constraints

CSV validation applies these hard rules:

- file size at most 5 MiB;
- required fields present after mapping;
- real calendar date in `YYYY-MM-DD` format;
- non-empty product ID, product name, and category;
- `price > 0`;
- `unitCost >= 0`;
- `unitsSold >= 0` and integer;
- `inventory >= 0` and integer;
- optional `promotion` value must match a supported boolean representation;
- each row must match the parsed column count;
- each product ID and date combination must be unique.

Malformed quoting stops the parse. A column-count mismatch rejects the affected row. Mixed row-quality files may import valid rows only; invalid rows never enter calculations.

## Known limitations

1. **Association is not causation.** Price often changes alongside promotion, seasonality, placement, product quality, or market conditions.
2. **Stockouts distort demand.** Units sold can be supply-constrained and lower than latent demand.
3. **Constant elasticity is simplified.** Real demand can have thresholds, reference-price effects, nonlinear segments, and asymmetric reactions.
4. **Small samples are unstable.** A few observations or narrow price movement can produce fragile slopes.
5. **Aggregation can hide segments.** Customers, channels, regions, and packages may react differently.
6. **No competitive response.** Competitor prices and strategic reactions are absent unless reflected indirectly in history.
7. **No uncertainty distribution.** Sensitivity cases are deterministic stress tests, not probabilistic forecasts.
8. **No operational constraints.** Taxes, price endings, contracts, minimum advertised price, channel rules, and brand constraints require separate review.

Use PricePilot to generate and inspect hypotheses. Validate material changes with a controlled test wherever feasible.
