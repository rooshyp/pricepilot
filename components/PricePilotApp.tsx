"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, type AppView } from "@/components/AppShell";
import { DataWorkspace } from "@/components/DataWorkspace";
import { OpportunitiesView } from "@/components/OpportunitiesView";
import { Overview } from "@/components/Overview";
import { ProductAnalysis } from "@/components/ProductAnalysis";
import { SAMPLE_PERIOD_LABEL, sampleObservations } from "@/data/sample";
import { analyzePortfolio } from "@/lib/analysis";
import type { CsvRecord } from "@/lib/csv";
import type { PricingObservation } from "@/types/pricing";

export function PricePilotApp() {
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [observations, setObservations] = useState<PricingObservation[]>([...sampleObservations]);
  const [selectedProductId, setSelectedProductId] = useState(sampleObservations[0].productId);
  const [dataLabel, setDataLabel] = useState("Synthetic sample");

  const analysisResult = useMemo(() => {
    try {
      return { summary: analyzePortfolio(observations), error: null };
    } catch (error) {
      return {
        summary: null,
        error: error instanceof Error ? error.message : "Pricing analysis could not be completed.",
      };
    }
  }, [observations]);

  const selectProduct = (productId: string) => {
    setSelectedProductId(productId);
    setActiveView("product");
  };

  const importRecords = (records: CsvRecord[]) => {
    const next: PricingObservation[] = records.map((record) => ({
      date: record.date,
      productId: record.productId,
      productName: record.productName,
      category: record.category,
      price: record.price,
      unitCost: record.unitCost,
      unitsSold: record.unitsSold,
      inventory: record.inventory,
      isPromotion: record.promotion,
    }));
    setObservations(next);
    setDataLabel("Imported CSV");
    setSelectedProductId(next[0]?.productId ?? "");
  };

  const restoreSample = () => {
    setObservations([...sampleObservations]);
    setDataLabel("Synthetic sample");
    setSelectedProductId(sampleObservations[0].productId);
  };

  const summary = analysisResult.summary;
  const selectedProduct =
    summary?.analyses.find((product) => product.productId === selectedProductId) ??
    summary?.analyses[0];

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      productCount={summary?.pricingOpportunityCount ?? 0}
      dataLabel={dataLabel}
    >
      {analysisResult.error || !summary ? (
        <section className="analysis-error" role="alert">
          <span><AlertTriangle size={20} /></span>
          <div><p className="eyebrow">Analysis paused</p><h2>Dataset needs attention</h2><p>{analysisResult.error}</p></div>
          <button className="button button--dark" onClick={restoreSample}><RotateCcw size={15} /> Restore sample data</button>
        </section>
      ) : activeView === "overview" ? (
        <Overview
          summary={summary}
          observations={observations}
          onSelectProduct={selectProduct}
          onViewOpportunities={() => setActiveView("opportunities")}
        />
      ) : activeView === "product" && selectedProduct ? (
        <ProductAnalysis
          key={selectedProduct.productId}
          product={selectedProduct}
          products={summary.analyses}
          onSelectProduct={selectProduct}
          onBack={() => setActiveView("overview")}
        />
      ) : activeView === "opportunities" ? (
        <OpportunitiesView summary={summary} onSelectProduct={selectProduct} />
      ) : (
        <DataWorkspace
          onImport={importRecords}
          onRestoreSample={restoreSample}
          activeLabel={dataLabel === "Synthetic sample" ? `${dataLabel} · ${SAMPLE_PERIOD_LABEL}` : dataLabel}
          observationCount={observations.length}
        />
      )}
    </AppShell>
  );
}
