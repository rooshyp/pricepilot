"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  CSV_FIELDS,
  REQUIRED_CSV_FIELDS,
  SAMPLE_CSV,
  fieldLabel,
  parseCsv,
  type CsvColumnOverrides,
  type CsvField,
  type CsvParseResult,
  type CsvRecord,
} from "@/lib/csv";

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_VISIBLE_ERRORS = 12;

export interface CsvImporterProps {
  onImport: (records: CsvRecord[]) => void;
  className?: string;
  previewRows?: number;
  maxFileSize?: number;
}

function joinClassNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pricepilot-sample.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MappingControls({
  result,
  onChange,
}: {
  result: CsvParseResult;
  onChange: (field: CsvField, header: string) => void;
}) {
  return (
    <section className="csv-importer__mapping" aria-labelledby="csv-mapping-title">
      <div className="csv-importer__section-heading">
        <div>
          <p className="csv-importer__eyebrow">Column mapping</p>
          <h3 id="csv-mapping-title">Match columns to PricePilot</h3>
        </div>
        <p>Common names map automatically. Adjust any mismatch.</p>
      </div>

      <div className="csv-importer__mapping-grid">
        {CSV_FIELDS.map((field) => {
          const required = REQUIRED_CSV_FIELDS.includes(
            field as (typeof REQUIRED_CSV_FIELDS)[number],
          );
          const hasMissingError = result.errors.some(
            (error) => error.code === "missing_column" && error.field === field,
          );

          return (
            <label
              className={joinClassNames(
                "csv-importer__mapping-field",
                hasMissingError && "csv-importer__mapping-field--error",
              )}
              key={field}
            >
              <span>
                {fieldLabel(field)}
                {required ? <span aria-label="required"> *</span> : <span> (optional)</span>}
              </span>
              <select
                aria-invalid={hasMissingError || undefined}
                value={result.mapping[field] ?? ""}
                onChange={(event) => onChange(field, event.target.value)}
              >
                <option value="">Not mapped</option>
                {result.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function ValidationSummary({ result }: { result: CsvParseResult }) {
  const visibleErrors = result.errors.slice(0, MAX_VISIBLE_ERRORS);
  const remainingErrors = result.errors.length - visibleErrors.length;

  if (result.errors.length === 0) {
    return (
      <div className="csv-importer__notice csv-importer__notice--success" role="status">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Ready to import</strong>
          <p>
            {result.validRows} {result.validRows === 1 ? "row passed" : "rows passed"} every
            validation check.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="csv-importer__validation"
      aria-labelledby="csv-validation-title"
      aria-live="polite"
    >
      <div className="csv-importer__notice csv-importer__notice--warning">
        <span aria-hidden="true">!</span>
        <div>
          <strong id="csv-validation-title">
            {result.errors.length} {result.errors.length === 1 ? "issue" : "issues"} found
          </strong>
          <p>
            {result.validRows > 0
              ? `${result.validRows} valid ${result.validRows === 1 ? "row is" : "rows are"} still available to import.`
              : "Fix column mapping or file values before importing."}
          </p>
        </div>
      </div>

      <ul className="csv-importer__error-list">
        {visibleErrors.map((error, index) => (
          <li key={`${error.code}-${error.row ?? "file"}-${error.field ?? "general"}-${index}`}>
            <span className="csv-importer__error-location">
              {error.row ? `Row ${error.row}` : "File"}
              {error.field ? ` · ${fieldLabel(error.field)}` : ""}
            </span>
            <span>{error.message.replace(/^Row \d+:\s*/, "")}</span>
          </li>
        ))}
      </ul>

      {remainingErrors > 0 ? (
        <p className="csv-importer__more-errors">+ {remainingErrors} more issues in this file</p>
      ) : null}
    </section>
  );
}

function DataPreview({ result }: { result: CsvParseResult }) {
  if (result.preview.length === 0 || result.headers.length === 0) return null;

  return (
    <section className="csv-importer__preview" aria-labelledby="csv-preview-title">
      <div className="csv-importer__section-heading">
        <div>
          <p className="csv-importer__eyebrow">Data preview</p>
          <h3 id="csv-preview-title">First {result.preview.length} rows</h3>
        </div>
        <p>
          {result.totalRows} total {result.totalRows === 1 ? "row" : "rows"}
        </p>
      </div>

      <div className="csv-importer__table-wrap" role="region" aria-label="CSV preview">
        <table className="csv-importer__table">
          <caption className="csv-importer__sr-only">
            Preview of uploaded CSV rows and mapped PricePilot fields
          </caption>
          <thead>
            <tr>
              <th scope="col">Row</th>
              {result.headers.map((header) => {
                const mappedField = CSV_FIELDS.find((field) => result.mapping[field] === header);
                return (
                  <th scope="col" key={header}>
                    <span>{header}</span>
                    {mappedField ? (
                      <small className="csv-importer__mapped-label">
                        → {fieldLabel(mappedField)}
                      </small>
                    ) : null}
                  </th>
                );
              })}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.preview.map((row) => (
              <tr className={row.valid ? undefined : "csv-importer__row--error"} key={row.rowNumber}>
                <th scope="row">{row.rowNumber}</th>
                {result.headers.map((header) => {
                  const mappedField = CSV_FIELDS.find((field) => result.mapping[field] === header);
                  const hasError = row.errors.some((error) => error.field === mappedField);
                  return (
                    <td
                      className={hasError ? "csv-importer__cell--error" : undefined}
                      key={header}
                      title={hasError ? row.errors.find((error) => error.field === mappedField)?.message : undefined}
                    >
                      {row.values[header] || <span className="csv-importer__empty-value">Empty</span>}
                    </td>
                  );
                })}
                <td>
                  <span
                    className={joinClassNames(
                      "csv-importer__status",
                      row.valid ? "csv-importer__status--valid" : "csv-importer__status--invalid",
                    )}
                  >
                    {row.valid ? "Valid" : "Check row"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CsvImporter({
  onImport,
  className,
  previewRows = 5,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
}: CsvImporterProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawCsv, setRawCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [mappingOverrides, setMappingOverrides] = useState<CsvColumnOverrides>({});
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState("");
  const [importedRows, setImportedRows] = useState<number | null>(null);

  const result = useMemo(
    () => (rawCsv === null ? null : parseCsv(rawCsv, mappingOverrides, previewRows)),
    [rawCsv, mappingOverrides, previewRows],
  );

  const chooseFile = () => inputRef.current?.click();

  const clearFile = () => {
    setRawCsv(null);
    setFileName("");
    setFileSize(0);
    setMappingOverrides({});
    setFileError("");
    setImportedRows(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setImportedRows(null);
    setFileError("");

    if (!isCsvFile(file)) {
      setFileError("Choose a .csv file.");
      return;
    }

    if (file.size > maxFileSize) {
      setFileError(`File is too large. Maximum size is ${formatBytes(maxFileSize)}.`);
      return;
    }

    try {
      const text = await file.text();
      setRawCsv(text);
      setFileName(file.name);
      setFileSize(file.size);
      setMappingOverrides({});
    } catch {
      setFileError("Could not read this file. Try saving it as UTF-8 CSV and upload again.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const changeMapping = (field: CsvField, header: string) => {
    if (!result) return;

    const next: CsvColumnOverrides = {};
    for (const currentField of CSV_FIELDS) {
      const currentHeader = result.mapping[currentField];
      next[currentField] = currentHeader ?? null;
    }

    if (!header) {
      next[field] = null;
    } else {
      for (const currentField of CSV_FIELDS) {
        if (currentField !== field && next[currentField] === header) next[currentField] = null;
      }
      next[field] = header;
    }

    setImportedRows(null);
    setMappingOverrides(next);
  };

  const importRows = () => {
    if (!result || result.records.length === 0) return;
    onImport(result.records);
    setImportedRows(result.records.length);
  };

  return (
    <section className={joinClassNames("csv-importer", className)} aria-labelledby="csv-importer-title">
      <div className="csv-importer__header">
        <div>
          <p className="csv-importer__eyebrow">Bring your own data</p>
          <h2 id="csv-importer-title">Import pricing history</h2>
          <p>
            Upload historical prices and sales. PricePilot validates every row before analysis.
          </p>
        </div>
        <button className="csv-importer__sample-button" type="button" onClick={downloadSampleCsv}>
          <span aria-hidden="true">↓</span>
          Download sample CSV
        </button>
      </div>

      <label className="csv-importer__file-label" htmlFor={inputId}>
        Pricing history CSV
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="csv-importer__file-input"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => void loadFile(event.target.files?.[0])}
        tabIndex={-1}
      />

      {!result ? (
        <div
          className={joinClassNames(
            "csv-importer__dropzone",
            dragActive && "csv-importer__dropzone--active",
            fileError && "csv-importer__dropzone--error",
          )}
          role="button"
          tabIndex={0}
          aria-describedby={`${inputId}-help${fileError ? ` ${inputId}-error` : ""}`}
          onClick={chooseFile}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              chooseFile();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void loadFile(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="csv-importer__upload-icon" aria-hidden="true">
            ↑
          </span>
          <strong>{dragActive ? "Drop CSV to check it" : "Drop CSV here, or choose a file"}</strong>
          <span id={`${inputId}-help`}>CSV up to {formatBytes(maxFileSize)} · Data stays in your browser</span>
        </div>
      ) : (
        <div className="csv-importer__file-summary">
          <span className="csv-importer__file-icon" aria-hidden="true">
            CSV
          </span>
          <div>
            <strong>{fileName}</strong>
            <span>
              {formatBytes(fileSize)} · {result.totalRows} data {result.totalRows === 1 ? "row" : "rows"}
            </span>
          </div>
          <button type="button" onClick={clearFile} aria-label={`Remove ${fileName}`}>
            Remove
          </button>
        </div>
      )}

      {fileError ? (
        <p className="csv-importer__file-error" id={`${inputId}-error`} role="alert">
          {fileError}
        </p>
      ) : null}

      {result ? (
        <>
          <MappingControls result={result} onChange={changeMapping} />
          <ValidationSummary result={result} />
          <DataPreview result={result} />

          <div className="csv-importer__actions">
            <div aria-live="polite">
              {importedRows !== null ? (
                <p className="csv-importer__imported-message">
                  ✓ {importedRows} {importedRows === 1 ? "row" : "rows"} loaded into analysis.
                </p>
              ) : result.invalidRows > 0 && result.validRows > 0 ? (
                <p>{result.invalidRows} invalid {result.invalidRows === 1 ? "row will" : "rows will"} be skipped.</p>
              ) : null}
            </div>
            <button
              className="csv-importer__import-button"
              type="button"
              disabled={result.validRows === 0}
              onClick={importRows}
            >
              Import {result.validRows > 0 ? `${result.validRows} valid ` : ""}
              {result.validRows === 1 ? "row" : "rows"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
