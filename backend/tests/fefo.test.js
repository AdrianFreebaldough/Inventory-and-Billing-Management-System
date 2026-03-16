import test from "node:test";
import assert from "node:assert/strict";
import { FEFO_RISK, buildFefoAllocationPlan, classifyExpiryRisk } from "../services/fefoService.js";

test("FEFO allocates from earliest expiry first and splits batches", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");
  const batches = [
    { _id: "b-jul", batchNumber: "B-JUL", quantity: 5, expiryDate: "2026-07-20T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
    { _id: "b-oct", batchNumber: "B-OCT", quantity: 10, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
  ];

  const result = buildFefoAllocationPlan({
    batches,
    requestedQuantity: 8,
    referenceDate,
  });

  assert.equal(result.fulfilled, true);
  assert.equal(result.remaining, 0);
  assert.deepEqual(
    result.allocations.map((entry) => ({ batchId: entry.batchId, quantity: entry.quantity })),
    [{ batchId: "b-jul", quantity: 5 }, { batchId: "b-oct", quantity: 3 }]
  );
});

test("FEFO excludes expired batches and uses next eligible batch", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");
  const batches = [
    { _id: "b-expired", batchNumber: "B-OLD", quantity: 100, expiryDate: "2026-03-10T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
    { _id: "b-valid", batchNumber: "B-VALID", quantity: 4, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z" },
  ];

  const result = buildFefoAllocationPlan({
    batches,
    requestedQuantity: 3,
    referenceDate,
  });

  assert.equal(result.fulfilled, true);
  assert.deepEqual(
    result.allocations.map((entry) => entry.batchId),
    ["b-valid"]
  );
});

test("FEFO preserves deterministic order for exact expiry ties using createdAt", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");
  const batches = [
    { _id: "b-late", batchNumber: "B-LATE", quantity: 3, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-03T00:00:00.000Z" },
    { _id: "b-early", batchNumber: "B-EARLY", quantity: 2, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
  ];

  const result = buildFefoAllocationPlan({
    batches,
    requestedQuantity: 4,
    referenceDate,
  });

  assert.equal(result.fulfilled, true);
  assert.deepEqual(
    result.allocations.map((entry) => ({ batchId: entry.batchId, quantity: entry.quantity })),
    [
      { batchId: "b-early", quantity: 2 },
      { batchId: "b-late", quantity: 2 },
    ]
  );
});

test("FEFO reports insufficient stock when total eligible quantity is not enough", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");
  const batches = [
    { _id: "b1", batchNumber: "B1", quantity: 2, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
    { _id: "b2", batchNumber: "B2", quantity: 1, expiryDate: "2026-11-01T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z" },
  ];

  const result = buildFefoAllocationPlan({
    batches,
    requestedQuantity: 10,
    referenceDate,
  });

  assert.equal(result.fulfilled, false);
  assert.equal(result.remaining, 7);
  assert.equal(result.totalAllocated, 3);
});

test("FEFO excludes pending disposal but allows immediate review batches", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");
  const batches = [
    { _id: "b-pending", batchNumber: "B-PENDING", quantity: 10, expiryDate: "2026-10-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", status: "Pending Disposal" },
    { _id: "b-review", batchNumber: "B-REVIEW", quantity: 10, expiryDate: "2026-04-15T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z" },
    { _id: "b-eligible", batchNumber: "B-ELIGIBLE", quantity: 6, expiryDate: "2026-10-20T00:00:00.000Z", createdAt: "2026-01-03T00:00:00.000Z" },
  ];

  const result = buildFefoAllocationPlan({
    batches,
    requestedQuantity: 5,
    referenceDate,
  });

  assert.equal(result.fulfilled, true);
  assert.deepEqual(result.allocations.map((entry) => entry.batchId), ["b-review"]);
});

test("Expiry risk classification respects 3/6-month thresholds", () => {
  const referenceDate = new Date("2026-03-16T00:00:00.000Z");

  assert.equal(classifyExpiryRisk(null, referenceDate), FEFO_RISK.NO_EXPIRY);
  assert.equal(classifyExpiryRisk("2026-03-15T00:00:00.000Z", referenceDate), FEFO_RISK.EXPIRED);
  assert.equal(classifyExpiryRisk("2026-04-15T00:00:00.000Z", referenceDate), FEFO_RISK.RED);
  assert.equal(classifyExpiryRisk("2026-07-01T00:00:00.000Z", referenceDate), FEFO_RISK.YELLOW);
  assert.equal(classifyExpiryRisk("2026-10-01T00:00:00.000Z", referenceDate), FEFO_RISK.GREEN);
});
