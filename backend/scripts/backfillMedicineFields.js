import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/product.js";

const DOSAGE_FORMS = new Set([
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Ointment",
  "Cream",
  "Drops",
  "Inhaler",
  "Powder",
]);

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};

const extractStrengthFromName = (name) => {
  const text = String(name || "");
  const match = text.match(/(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|units)(?:\s*\/\s*\d+(?:\.\d+)?\s*ml)?)/i);
  return match ? match[1].trim() : null;
};

const normalizeDosageForm = (candidate, unit) => {
  const value = pickFirstNonEmpty(candidate);
  if (value && DOSAGE_FORMS.has(value)) return value;

  const unitText = pickFirstNonEmpty(unit);
  if (unitText && DOSAGE_FORMS.has(unitText)) return unitText;

  return null;
};

const run = async () => {
  const uri = process.env.IBMS_DB_URI || process.env.PARMS_DB_URI;
  if (!uri) {
    throw new Error("Missing IBMS_DB_URI or PARMS_DB_URI in environment");
  }

  await mongoose.connect(uri);

  const cursor = Product.find({ isArchived: { $ne: true } }).cursor();

  let scanned = 0;
  let updated = 0;

  for await (const product of cursor) {
    scanned += 1;

    const nextGenericName = pickFirstNonEmpty(
      product.genericName,
      product.get("generic"),
      product.medicineName,
      product.name
    );

    const nextDosageForm = normalizeDosageForm(
      pickFirstNonEmpty(product.dosageForm, product.get("dosage")),
      product.unit
    );

    const nextStrength = pickFirstNonEmpty(
      product.strength,
      product.get("dose"),
      extractStrengthFromName(product.name)
    );

    let changed = false;

    if (nextGenericName && nextGenericName !== product.genericName) {
      product.genericName = nextGenericName;
      changed = true;
    }

    if (nextDosageForm && nextDosageForm !== product.dosageForm) {
      product.dosageForm = nextDosageForm;
      changed = true;
    }

    if (nextStrength && nextStrength !== product.strength) {
      product.strength = nextStrength;
      changed = true;
    }

    if (changed) {
      await product.save();
      updated += 1;
    }
  }

  console.log(JSON.stringify({ scanned, updated }, null, 2));
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Backfill failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors on failure path.
  }
  process.exit(1);
});
