export const CSV_FIELDS = [
  "date",
  "productId",
  "productName",
  "category",
  "price",
  "unitCost",
  "unitsSold",
  "inventory",
  "promotion",
] as const;

export type CsvField = (typeof CSV_FIELDS)[number];

export const REQUIRED_CSV_FIELDS = CSV_FIELDS.filter(
  (field): field is Exclude<CsvField, "promotion"> => field !== "promotion",
);

export interface CsvRecord {
  date: string;
  productId: string;
  productName: string;
  category: string;
  price: number;
  unitCost: number;
  unitsSold: number;
  inventory: number;
  promotion?: boolean;
}

export type CsvColumnMapping = Partial<Record<CsvField, string>>;
export type CsvColumnOverrides = Partial<Record<CsvField, string | null>>;

export type CsvErrorCode =
  | "empty_file"
  | "malformed_csv"
  | "duplicate_header"
  | "missing_column"
  | "duplicate_mapping"
  | "column_count"
  | "required"
  | "invalid_date"
  | "invalid_number"
  | "out_of_range"
  | "invalid_integer"
  | "invalid_boolean"
  | "duplicate_record";

export interface CsvValidationError {
  code: CsvErrorCode;
  message: string;
  row?: number;
  field?: CsvField;
  value?: string;
}

export interface CsvPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  valid: boolean;
  errors: CsvValidationError[];
}

export interface CsvParseResult {
  headers: string[];
  mapping: CsvColumnMapping;
  records: CsvRecord[];
  preview: CsvPreviewRow[];
  errors: CsvValidationError[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

interface TokenizedRow {
  cells: string[];
  line: number;
}

interface TokenizeResult {
  rows: TokenizedRow[];
  error?: CsvValidationError;
}

const FIELD_ALIASES: Record<CsvField, readonly string[]> = {
  date: ["date", "sales date", "transaction date", "order date", "period", "timestamp"],
  productId: [
    "product id",
    "productid",
    "product_id",
    "sku",
    "item id",
    "item_id",
    "item code",
  ],
  productName: [
    "product name",
    "productname",
    "product_name",
    "product",
    "item name",
    "item_name",
    "item",
  ],
  category: ["category", "product category", "department", "segment"],
  price: [
    "price",
    "unit price",
    "unit_price",
    "selling price",
    "selling_price",
    "sale price",
  ],
  unitCost: [
    "unit cost",
    "unitcost",
    "unit_cost",
    "cost",
    "cost per unit",
    "cogs per unit",
  ],
  unitsSold: [
    "units sold",
    "unitssold",
    "units_sold",
    "quantity",
    "qty",
    "sales volume",
    "volume",
  ],
  inventory: [
    "inventory",
    "stock",
    "stock level",
    "inventory level",
    "units in stock",
    "on hand",
  ],
  promotion: [
    "promotion",
    "promo",
    "promoted",
    "on promotion",
    "is promotion",
    "discounted",
  ],
};

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "promo", "promoted"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "none", "regular"]);

export const SAMPLE_CSV = [
  "date,productId,productName,category,price,unitCost,unitsSold,inventory,promotion",
  "2026-01-05,SKU-101,Everyday Coffee 12oz,Beverages,14.99,5.4,118,342,false",
  "2026-01-12,SKU-101,Everyday Coffee 12oz,Beverages,13.99,5.4,136,206,true",
  "2026-01-05,SKU-204,Trail Mix 8oz,Snacks,8.49,3.1,82,190,false",
].join("\n");

const normalizeHeader = (header: string) =>
  header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

const isBlankRow = (cells: readonly string[]) => cells.every((cell) => cell.trim() === "");

function tokenizeCsv(input: string): TokenizeResult {
  const rows: TokenizedRow[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let afterClosingQuote = false;
  let line = 1;
  let rowStartLine = 1;

  const pushRow = () => {
    row.push(cell);
    rows.push({ cells: row, line: rowStartLine });
    row = [];
    cell = "";
    afterClosingQuote = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else {
        cell += character;
        if (character === "\n") line += 1;
      }
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        row.push(cell);
        cell = "";
        afterClosingQuote = false;
        continue;
      }

      if (character === "\r" || character === "\n") {
        if (character === "\r" && input[index + 1] === "\n") index += 1;
        pushRow();
        line += 1;
        rowStartLine = line;
        continue;
      }

      if (character === " " || character === "\t") continue;

      return {
        rows,
        error: {
          code: "malformed_csv",
          row: line,
          message: `Row ${line}: unexpected character after a closing quote.`,
        },
      };
    }

    if (character === '"') {
      if (cell.length > 0) {
        return {
          rows,
          error: {
            code: "malformed_csv",
            row: line,
            message: `Row ${line}: quote must begin at the start of a field.`,
          },
        };
      }
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      pushRow();
      line += 1;
      rowStartLine = line;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    return {
      rows,
      error: {
        code: "malformed_csv",
        row: rowStartLine,
        message: `Row ${rowStartLine}: quoted field is not closed.`,
      },
    };
  }

  if (cell.length > 0 || row.length > 0 || afterClosingQuote) pushRow();

  return { rows };
}

export function mapCsvColumns(
  headers: readonly string[],
  overrides: CsvColumnOverrides = {},
): CsvColumnMapping {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: CsvColumnMapping = {};

  for (const field of CSV_FIELDS) {
    const aliases = new Set(FIELD_ALIASES[field].map(normalizeHeader));
    const matchIndex = normalizedHeaders.findIndex((header) => aliases.has(header));
    if (matchIndex >= 0) mapping[field] = headers[matchIndex];
  }

  for (const field of CSV_FIELDS) {
    if (!(field in overrides)) continue;
    const requestedHeader = overrides[field];
    if (requestedHeader === null) {
      delete mapping[field];
      continue;
    }
    if (requestedHeader !== undefined && headers.includes(requestedHeader)) {
      mapping[field] = requestedHeader;
    }
  }

  return mapping;
}

function parseNumber(
  rawValue: string,
  field: "price" | "unitCost" | "unitsSold" | "inventory",
  row: number,
): { value?: number; errors: CsvValidationError[] } {
  const value = rawValue.trim();
  const label = fieldLabel(field);

  if (!value) {
    return {
      errors: [{ code: "required", row, field, value: rawValue, message: `${label} is required.` }],
    };
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return {
      errors: [
        {
          code: "invalid_number",
          row,
          field,
          value: rawValue,
          message: `${label} must be a number.`,
        },
      ],
    };
  }

  if ((field === "price" && number <= 0) || (field !== "price" && number < 0)) {
    return {
      errors: [
        {
          code: "out_of_range",
          row,
          field,
          value: rawValue,
          message: field === "price" ? "Price must be greater than 0." : `${label} cannot be negative.`,
        },
      ],
    };
  }

  if ((field === "unitsSold" || field === "inventory") && !Number.isInteger(number)) {
    return {
      errors: [
        {
          code: "invalid_integer",
          row,
          field,
          value: rawValue,
          message: `${label} must be a whole number.`,
        },
      ],
    };
  }

  return { value: number, errors: [] };
}

function parsePromotion(
  rawValue: string,
  row: number,
): { value?: boolean; errors: CsvValidationError[] } {
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return { errors: [] };
  if (TRUE_VALUES.has(normalized)) return { value: true, errors: [] };
  if (FALSE_VALUES.has(normalized)) return { value: false, errors: [] };
  return {
    errors: [
      {
        code: "invalid_boolean",
        row,
        field: "promotion",
        value: rawValue,
        message: "Promotion must be yes/no, true/false, or 1/0.",
      },
    ],
  };
}

function isValidDate(value: string) {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!isoMatch) return false;

  const [, year, month, day] = isoMatch;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function buildPreviewValues(headers: readonly string[], cells: readonly string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
}

function validateRow(
  headers: readonly string[],
  cells: readonly string[],
  rowNumber: number,
  mapping: CsvColumnMapping,
): { record?: CsvRecord; errors: CsvValidationError[] } {
  const errors: CsvValidationError[] = [];
  const raw = (field: CsvField) => {
    const header = mapping[field];
    return header === undefined ? "" : (cells[headers.indexOf(header)] ?? "");
  };

  const textValues = {
    date: raw("date").trim(),
    productId: raw("productId").trim(),
    productName: raw("productName").trim(),
    category: raw("category").trim(),
  };

  for (const field of ["productId", "productName", "category"] as const) {
    if (!textValues[field]) {
      errors.push({
        code: "required",
        row: rowNumber,
        field,
        value: raw(field),
        message: `${fieldLabel(field)} is required.`,
      });
    }
  }

  if (!textValues.date) {
    errors.push({
      code: "required",
      row: rowNumber,
      field: "date",
      value: raw("date"),
      message: "Date is required.",
    });
  } else if (!isValidDate(textValues.date)) {
    errors.push({
      code: "invalid_date",
      row: rowNumber,
      field: "date",
      value: raw("date"),
      message: "Date must use YYYY-MM-DD and be a valid calendar date.",
    });
  }

  const price = parseNumber(raw("price"), "price", rowNumber);
  const unitCost = parseNumber(raw("unitCost"), "unitCost", rowNumber);
  const unitsSold = parseNumber(raw("unitsSold"), "unitsSold", rowNumber);
  const inventory = parseNumber(raw("inventory"), "inventory", rowNumber);
  const promotion = parsePromotion(raw("promotion"), rowNumber);

  errors.push(
    ...price.errors,
    ...unitCost.errors,
    ...unitsSold.errors,
    ...inventory.errors,
    ...promotion.errors,
  );

  if (errors.length > 0) return { errors };

  const record: CsvRecord = {
    ...textValues,
    price: price.value!,
    unitCost: unitCost.value!,
    unitsSold: unitsSold.value!,
    inventory: inventory.value!,
  };

  if (mapping.promotion && promotion.value !== undefined) record.promotion = promotion.value;
  return { record, errors };
}

export function parseCsv(
  input: string,
  overrides: CsvColumnOverrides = {},
  previewLimit = 5,
): CsvParseResult {
  const emptyResult: CsvParseResult = {
    headers: [],
    mapping: {},
    records: [],
    preview: [],
    errors: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
  };

  if (!input.trim()) {
    return {
      ...emptyResult,
      errors: [{ code: "empty_file", message: "CSV file is empty." }],
    };
  }

  const tokenized = tokenizeCsv(input);
  if (tokenized.error) return { ...emptyResult, errors: [tokenized.error] };

  const nonBlankRows = tokenized.rows.filter((row) => !isBlankRow(row.cells));
  if (nonBlankRows.length === 0) {
    return {
      ...emptyResult,
      errors: [{ code: "empty_file", message: "CSV file is empty." }],
    };
  }

  const headers = nonBlankRows[0].cells.map((header, index) => {
    const cleaned = header.replace(/^\uFEFF/, "").trim();
    return cleaned || `Column ${index + 1}`;
  });
  const mapping = mapCsvColumns(headers, overrides);
  const errors: CsvValidationError[] = [];

  const normalizedHeaderCounts = new Map<string, number>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    normalizedHeaderCounts.set(normalized, (normalizedHeaderCounts.get(normalized) ?? 0) + 1);
  }
  for (const [header, count] of normalizedHeaderCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_header",
        message: `Header “${header}” appears more than once. Rename duplicate columns.`,
      });
    }
  }

  for (const field of REQUIRED_CSV_FIELDS) {
    if (!mapping[field]) {
      errors.push({
        code: "missing_column",
        field,
        message: `Map a column to required field ${fieldLabel(field)}.`,
      });
    }
  }

  const usedHeaders = new Map<string, CsvField>();
  for (const field of CSV_FIELDS) {
    const header = mapping[field];
    if (!header) continue;
    const existing = usedHeaders.get(header);
    if (existing) {
      errors.push({
        code: "duplicate_mapping",
        field,
        message: `Column “${header}” is mapped to both ${fieldLabel(existing)} and ${fieldLabel(field)}.`,
      });
    } else {
      usedHeaders.set(header, field);
    }
  }

  const rows = nonBlankRows.slice(1);
  const preview: CsvPreviewRow[] = [];
  const records: CsvRecord[] = [];
  const observationRows = new Map<string, number>();
  const canValidateRows = !errors.some(
    (error) =>
      error.code === "missing_column" ||
      error.code === "duplicate_mapping" ||
      error.code === "duplicate_header",
  );
  let invalidRows = 0;

  for (const row of rows) {
    const rowErrors: CsvValidationError[] = [];
    if (row.cells.length !== headers.length) {
      rowErrors.push({
        code: "column_count",
        row: row.line,
        message: `Row ${row.line} has ${row.cells.length} columns; expected ${headers.length}.`,
      });
    } else if (canValidateRows) {
      const validation = validateRow(headers, row.cells, row.line, mapping);
      rowErrors.push(...validation.errors);
      if (validation.record) {
        const observationKey = `${validation.record.productId}\u0000${validation.record.date}`;
        const firstRow = observationRows.get(observationKey);

        if (firstRow !== undefined) {
          rowErrors.push({
            code: "duplicate_record",
            row: row.line,
            field: "productId",
            value: validation.record.productId,
            message: `Duplicate observation for ${validation.record.productId} on ${validation.record.date}; first appears on row ${firstRow}.`,
          });
        } else {
          observationRows.set(observationKey, row.line);
          records.push(validation.record);
        }
      }
    }

    if (!canValidateRows || rowErrors.length > 0) invalidRows += 1;
    errors.push(...rowErrors);

    if (preview.length < Math.max(0, previewLimit)) {
      preview.push({
        rowNumber: row.line,
        values: buildPreviewValues(headers, row.cells),
        valid: canValidateRows && rowErrors.length === 0,
        errors: rowErrors,
      });
    }
  }

  if (rows.length === 0) {
    errors.push({ code: "empty_file", message: "CSV has a header row but no data rows." });
  }

  return {
    headers,
    mapping,
    records,
    preview,
    errors,
    totalRows: rows.length,
    validRows: records.length,
    invalidRows,
  };
}

export function fieldLabel(field: CsvField) {
  const labels: Record<CsvField, string> = {
    date: "Date",
    productId: "Product ID",
    productName: "Product name",
    category: "Category",
    price: "Price",
    unitCost: "Unit cost",
    unitsSold: "Units sold",
    inventory: "Inventory",
    promotion: "Promotion",
  };
  return labels[field];
}
