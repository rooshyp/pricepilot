"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

type TrendTone = "positive" | "negative" | "neutral";

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  tone?: TrendTone;
  icon: LucideIcon;
}) {
  const TrendIcon =
    tone === "positive"
      ? ArrowUpRight
      : tone === "negative"
        ? ArrowDownRight
        : Minus;

  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span>{label}</span>
        <span className="icon-chip" aria-hidden="true">
          <Icon size={17} strokeWidth={1.8} />
        </span>
      </div>
      <strong className="metric-card__value">{value}</strong>
      {(trend || detail) && (
        <div className="metric-card__detail">
          {trend && (
            <span className={`trend trend--${tone}`}>
              <TrendIcon size={13} /> {trend}
            </span>
          )}
          {detail && <span>{detail}</span>}
        </div>
      )}
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </header>
  );
}

export function ConfidenceBadge({
  level,
}: {
  level: "high" | "medium" | "low" | string;
}) {
  const normalized = level.toLowerCase();
  return (
    <span className={`confidence confidence--${normalized}`}>
      <span aria-hidden="true" />
      {level} confidence
    </span>
  );
}

export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const tone = value > 0.05 ? "positive" : value < -0.05 ? "negative" : "neutral";
  const Icon = tone === "positive" ? ArrowUpRight : tone === "negative" ? ArrowDownRight : Minus;

  return (
    <span className={`delta delta--${tone}`}>
      <Icon size={13} />
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}{suffix}
    </span>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (value) => String(value),
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  formatValue?: (value: number, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      {label && <p>{label}</p>}
      {payload.map((item) => (
        <div key={item.name}>
          <span style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{formatValue(Number(item.value), item.name)}</strong>
        </div>
      ))}
    </div>
  );
}
