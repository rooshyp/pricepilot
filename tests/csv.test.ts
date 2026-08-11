import { describe, expect, it } from "vitest";
import { SAMPLE_CSV, mapCsvColumns, parseCsv } from "../lib/csv";

const header =
  "date,productId,productName,category,price,unitCost,unitsSold,inventory,promotion";

describe("parseCsv", () => {
  it("parses a valid canonical CSV into typed records", () => {
    const result = parseCsv(
      `${header}\n2026-03-01,SKU-1,Desk Lamp,Home,29.95,11.4,20,78,true`,
    );

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
    expect(result.records).toEqual([
      {
        date: "2026-03-01",
        productId: "SKU-1",
        productName: "Desk Lamp",
        category: "Home",
        price: 29.95,
        unitCost: 11.4,
        unitsSold: 20,
        inventory: 78,
        promotion: true,
      },
    ]);
  });

  it("maps common column aliases and handles quoted fields", () => {
    const csv = [
      "Sales Date,SKU,Product,Department,Unit Price,Cost,Qty,Stock,Promo",
      '2026-03-02,LAMP-2,"Lamp, Brass",Home,42.00,18.25,12,30,yes',
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.mapping).toMatchObject({
      date: "Sales Date",
      productId: "SKU",
      productName: "Product",
      category: "Department",
      price: "Unit Price",
      unitCost: "Cost",
      unitsSold: "Qty",
      inventory: "Stock",
      promotion: "Promo",
    });
    expect(result.records[0]).toMatchObject({
      productName: "Lamp, Brass",
      unitsSold: 12,
      promotion: true,
    });
  });

  it("accepts manual column overrides for unfamiliar headers", () => {
    const headers = ["When", "Code", "Title", "Group", "Retail", "Landed", "Sold", "Left"];
    const mapping = mapCsvColumns(headers, {
      date: "When",
      productId: "Code",
      productName: "Title",
      category: "Group",
      price: "Retail",
      unitCost: "Landed",
      unitsSold: "Sold",
      inventory: "Left",
    });

    expect(mapping).toEqual({
      date: "When",
      productId: "Code",
      productName: "Title",
      category: "Group",
      price: "Retail",
      unitCost: "Landed",
      unitsSold: "Sold",
      inventory: "Left",
    });

    const result = parseCsv(
      `${headers.join(",")}\n2026-03-03,A-1,Adapter,Accessories,19,7,8,14`,
      mapping,
    );
    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
  });

  it("reports malformed quoting and wrong column counts", () => {
    const unclosed = parseCsv(`${header}\n2026-03-01,SKU-1,"Desk Lamp,Home,29,11,20,78,false`);
    expect(unclosed.errors).toEqual([
      expect.objectContaining({ code: "malformed_csv", row: 2 }),
    ]);

    const shortRow = parseCsv(`${header}\n2026-03-01,SKU-1,Desk Lamp,Home,29,11,20`);
    expect(shortRow.records).toEqual([]);
    expect(shortRow.errors).toContainEqual(
      expect.objectContaining({ code: "column_count", row: 2 }),
    );
  });

  it("rejects negative prices, costs, sales, and inventory", () => {
    const csv = [
      header,
      "2026-03-01,A,Alpha,Core,-1,2,3,4,false",
      "2026-03-01,B,Beta,Core,1,-2,3,4,false",
      "2026-03-01,C,Gamma,Core,1,2,-3,4,false",
      "2026-03-01,D,Delta,Core,1,2,3,-4,false",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.records).toEqual([]);
    expect(result.invalidRows).toBe(4);
    expect(result.errors.filter((error) => error.code === "out_of_range")).toEqual([
      expect.objectContaining({ field: "price", row: 2 }),
      expect.objectContaining({ field: "unitCost", row: 3 }),
      expect.objectContaining({ field: "unitsSold", row: 4 }),
      expect.objectContaining({ field: "inventory", row: 5 }),
    ]);
  });

  it("reports every missing required field before row parsing", () => {
    const result = parseCsv(
      "date,productId,productName,price,unitCost,unitsSold\n2026-03-01,A,Alpha,10,4,5",
    );

    expect(result.records).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_column", field: "category" }),
        expect.objectContaining({ code: "missing_column", field: "inventory" }),
      ]),
    );
  });

  it("keeps valid rows when other rows fail validation", () => {
    const csv = [
      header,
      "2026-03-01,A,Alpha,Core,10,4,5,20,false",
      "2026-02-30,B,Beta,Core,12,5,not-a-number,20,maybe",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_date", row: 3, field: "date" }),
        expect.objectContaining({ code: "invalid_number", row: 3, field: "unitsSold" }),
        expect.objectContaining({ code: "invalid_boolean", row: 3, field: "promotion" }),
      ]),
    );
  });

  it("requires unambiguous YYYY-MM-DD calendar dates", () => {
    const csv = [
      header,
      "03/04/2026,A,Alpha,Core,10,4,5,20,false",
      "2026-02-30,B,Beta,Core,12,5,6,20,false",
      "2026-03-04,C,Gamma,Core,14,6,7,20,false",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].date).toBe("2026-03-04");
    expect(result.errors.filter((error) => error.code === "invalid_date")).toEqual([
      expect.objectContaining({ row: 2, field: "date", message: expect.stringContaining("YYYY-MM-DD") }),
      expect.objectContaining({ row: 3, field: "date", message: expect.stringContaining("YYYY-MM-DD") }),
    ]);
  });

  it("rejects later duplicate product and date observations", () => {
    const csv = [
      header,
      "2026-03-01,SKU-1,Alpha,Core,10,4,5,20,false",
      "2026-03-01,SKU-1,Alpha,Core,11,4,4,16,true",
      "2026-03-02,SKU-1,Alpha,Core,11,4,6,10,false",
    ].join("\n");

    const result = parseCsv(csv);

    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.records.map(({ productId, date }) => ({ productId, date }))).toEqual([
      { productId: "SKU-1", date: "2026-03-01" },
      { productId: "SKU-1", date: "2026-03-02" },
    ]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "duplicate_record",
        row: 3,
        field: "productId",
        message: expect.stringContaining("first appears on row 2"),
      }),
    );
    expect(result.preview[1].valid).toBe(false);
  });

  it("ships a valid sample CSV", () => {
    const result = parseCsv(SAMPLE_CSV);
    expect(result.errors).toEqual([]);
    expect(result.records.length).toBeGreaterThan(1);
  });
});
