import { roundTo } from "@/lib/economics";
import type { PricingObservation } from "@/types/pricing";

export const SYNTHETIC_DATA_NOTICE =
  "PricePilot sample data is fully synthetic. It represents no real company, customer, transaction, or market result.";

export const SAMPLE_PERIOD_LABEL = "July 2024 – June 2026";

export interface SampleProductProfile {
  productId: string;
  productName: string;
  category: string;
  behavior: string;
}

interface GeneratorProfile extends SampleProductProfile {
  basePrice: number;
  baseUnitCost: number;
  baseMonthlyDemand: number;
  generatingElasticity: number;
  monthlyTrend: number;
  priceSteps: readonly number[];
  seasonality: readonly number[];
  promotionMonth: number;
  promotionLift: number;
  baseInventoryCoverage: number;
  inventoryCoverageTrend: number;
  noiseOffset: number;
}

const MONTHLY_NOISE = [
  1.008, 0.989, 1.014, 0.996, 1.006, 0.982, 1.011, 1.001, 0.992, 1.017, 0.987,
  1.004, 1.013, 0.994, 1.007, 0.985, 1.016, 0.998, 1.003, 0.991, 1.01, 0.984,
  1.005, 0.997,
] as const;

const GENERATOR_PROFILES: readonly GeneratorProfile[] = [
  {
    productId: "folio-notebook",
    productName: "Folio Premium Notebook",
    category: "Office essentials",
    behavior: "Stable, relatively price-insensitive demand with gradual cost inflation.",
    basePrice: 18,
    baseUnitCost: 6.25,
    baseMonthlyDemand: 3_150,
    generatingElasticity: -0.42,
    monthlyTrend: 0.002,
    priceSteps: [1, 0.97, 1.04, 1.08, 1.03, 1.1, 1.06, 1.13],
    seasonality: [0.92, 0.96, 0.99, 1, 1.02, 1.01, 0.96, 1.17, 1.12, 1.03, 0.97, 0.94],
    promotionMonth: 10,
    promotionLift: 1.12,
    baseInventoryCoverage: 1.7,
    inventoryCoverageTrend: 0,
    noiseOffset: 0,
  },
  {
    productId: "pulse-earbuds",
    productName: "Pulse Wireless Earbuds",
    category: "Consumer electronics",
    behavior: "Highly price-sensitive demand in a competitive, fast-moving category.",
    basePrice: 84,
    baseUnitCost: 39,
    baseMonthlyDemand: 930,
    generatingElasticity: -1.85,
    monthlyTrend: -0.001,
    priceSteps: [1, 0.94, 1.05, 0.98, 1.1, 1.02, 1.14, 1.06],
    seasonality: [0.91, 0.88, 0.92, 0.95, 1.06, 1.3, 0.9, 0.88, 0.91, 0.94, 0.96, 0.99],
    promotionMonth: 16,
    promotionLift: 1.2,
    baseInventoryCoverage: 1.35,
    inventoryCoverageTrend: 0.005,
    noiseOffset: 5,
  },
  {
    productId: "harbor-bottle",
    productName: "Harbor Insulated Bottle",
    category: "Outdoor lifestyle",
    behavior: "Weakening demand paired with elevated and rising inventory coverage.",
    basePrice: 34,
    baseUnitCost: 11.8,
    baseMonthlyDemand: 1_760,
    generatingElasticity: -1.12,
    monthlyTrend: -0.006,
    priceSteps: [1, 1.05, 0.98, 1.08, 1.02, 1.12, 1.07, 1.15],
    seasonality: [0.86, 0.88, 0.95, 1.02, 1.1, 1.16, 1.13, 1.06, 1, 0.94, 0.89, 0.84],
    promotionMonth: 7,
    promotionLift: 1.15,
    baseInventoryCoverage: 3.4,
    inventoryCoverageTrend: 0.075,
    noiseOffset: 9,
  },
  {
    productId: "meridian-lamp",
    productName: "Meridian Desk Lamp",
    category: "Home office",
    behavior: "Pronounced winter seasonality with comparatively resilient demand.",
    basePrice: 68,
    baseUnitCost: 26.5,
    baseMonthlyDemand: 710,
    generatingElasticity: -0.7,
    monthlyTrend: 0.003,
    priceSteps: [1, 1.04, 0.99, 1.08, 1.03, 1.11, 1.07, 1.16],
    seasonality: [1.22, 1.14, 1.04, 0.98, 0.91, 0.86, 0.84, 0.88, 0.96, 1.05, 1.17, 1.28],
    promotionMonth: 13,
    promotionLift: 1.1,
    baseInventoryCoverage: 1.8,
    inventoryCoverageTrend: -0.004,
    noiseOffset: 14,
  },
  {
    productId: "stride-backpack",
    productName: "Stride Commuter Backpack",
    category: "Bags and carry",
    behavior: "Elastic demand with a clear back-to-school peak and moderate growth.",
    basePrice: 96,
    baseUnitCost: 42,
    baseMonthlyDemand: 640,
    generatingElasticity: -1.32,
    monthlyTrend: 0.004,
    priceSteps: [1, 0.96, 1.04, 1.09, 1.02, 1.12, 1.06, 1.15],
    seasonality: [0.87, 0.85, 0.9, 0.94, 0.98, 1.01, 1.04, 1.24, 1.36, 1.08, 0.94, 0.89],
    promotionMonth: 19,
    promotionLift: 1.18,
    baseInventoryCoverage: 1.55,
    inventoryCoverageTrend: 0.003,
    noiseOffset: 19,
  },
] as const;

export const sampleProductProfiles: readonly SampleProductProfile[] = GENERATOR_PROFILES.map(
  ({ productId, productName, category, behavior }) => ({
    productId,
    productName,
    category,
    behavior,
  }),
);

export const sampleObservations: readonly PricingObservation[] = GENERATOR_PROFILES.flatMap(
  (profile) => createProductHistory(profile),
).sort(
  (left, right) =>
    left.date.localeCompare(right.date) || left.productName.localeCompare(right.productName),
);

/** Friendly aliases for UI and import examples. */
export const sampleData = sampleObservations;
export const sampleProducts = sampleProductProfiles;

function createProductHistory(profile: GeneratorProfile): PricingObservation[] {
  return Array.from({ length: 24 }, (_, monthIndex) => {
    const date = monthDate(monthIndex);
    const calendarMonth = Number(date.slice(5, 7)) - 1;
    const priceBlock = Math.min(
      profile.priceSteps.length - 1,
      Math.floor(monthIndex / 3),
    );
    const isPromotion = monthIndex === profile.promotionMonth;
    const listPrice = profile.basePrice * profile.priceSteps[priceBlock];
    const price = roundTo(listPrice * (isPromotion ? 0.9 : 1), 2);
    const seasonalIndex = profile.seasonality[calendarMonth];
    const trend = (1 + profile.monthlyTrend) ** monthIndex;
    const priceResponse = (price / profile.basePrice) ** profile.generatingElasticity;
    const noise = MONTHLY_NOISE[(monthIndex + profile.noiseOffset) % MONTHLY_NOISE.length];
    const demand =
      profile.baseMonthlyDemand *
      seasonalIndex *
      trend *
      priceResponse *
      noise *
      (isPromotion ? profile.promotionLift : 1);
    const unitsSold = Math.max(0, Math.round(demand));
    const unitCost = roundTo(
      profile.baseUnitCost * (1 + Math.floor(monthIndex / 6) * 0.012),
      2,
    );
    const coverage = Math.max(
      0.6,
      profile.baseInventoryCoverage + profile.inventoryCoverageTrend * monthIndex,
    );
    const inventory = Math.round(
      unitsSold * coverage * (1 + 0.04 * Math.sin((monthIndex * Math.PI) / 3)),
    );

    return {
      date,
      productId: profile.productId,
      productName: profile.productName,
      category: profile.category,
      price,
      unitCost,
      unitsSold,
      inventory,
      isPromotion,
      seasonalIndex,
      note: isPromotion
        ? "Synthetic planned promotion"
        : monthIndex > 0 && monthIndex % 3 === 0
          ? "Synthetic list-price update"
          : "Synthetic monthly observation",
    };
  });
}

function monthDate(offset: number): string {
  const date = new Date(Date.UTC(2024, 6 + offset, 1));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
