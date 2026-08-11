"use client";

import { CheckCircle2, Database, FileCheck2, RotateCcw, ShieldCheck } from "lucide-react";
import type { CsvRecord } from "@/lib/csv";
import { CsvImporter } from "./CsvImporter";

export function DataWorkspace({
  onImport,
  onRestoreSample,
  activeLabel,
  observationCount,
}: {
  onImport: (records: CsvRecord[]) => void;
  onRestoreSample: () => void;
  activeLabel: string;
  observationCount: number;
}) {
  return (
    <div className="view-stack">
      <section className="data-context">
        <div className="data-context__status">
          <span className="data-context__icon"><Database size={19} /></span>
          <div>
            <p className="eyebrow">Active analysis source</p>
            <h2>{activeLabel}</h2>
            <p>{observationCount.toLocaleString("en-US")} validated observations available to the pricing engine.</p>
          </div>
        </div>
        <button className="button button--light" onClick={onRestoreSample}>
          <RotateCcw size={15} /> Restore synthetic sample
        </button>
      </section>

      <CsvImporter onImport={onImport} />

      <section className="data-principles" aria-label="Data handling principles">
        <article>
          <span><FileCheck2 size={18} /></span>
          <div><strong>Validate before modeling</strong><p>Malformed dates, negative values, and incomplete fields surface before calculations.</p></div>
        </article>
        <article>
          <span><ShieldCheck size={18} /></span>
          <div><strong>Local by default</strong><p>Imported CSV content stays in this browser session; no upload service is required.</p></div>
        </article>
        <article>
          <span><CheckCircle2 size={18} /></span>
          <div><strong>Honest confidence</strong><p>Limited price variation or history lowers confidence instead of inventing certainty.</p></div>
        </article>
      </section>
    </div>
  );
}
