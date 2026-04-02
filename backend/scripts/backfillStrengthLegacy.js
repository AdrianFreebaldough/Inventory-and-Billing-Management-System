import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/product.js";

const KNOWN_STRENGTH_BY_NAME = {
  "biogesic": "500 mg",
  "advil": "200 mg",
  "buscopan": "10 mg",
  "amoxil": "500 mg",
  "kremil-s": "178 mg / 233 mg / 30 mg",
};

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const extractStrengthFromText = (value) => {
  const text = String(value || "");
  const match = text.match(/(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|units)(?:\s*\/\s*\d+(?:\.\d+)?\s*ml)?)/i);
  return match ? match[1].trim() : null;
};

const run = async () => {
  const uri = process.env.IBMS_DB_URI || process.env.PARMS_DB_URI;
  if (!uri) {
    throw new Error("Missing IBMS_DB_URI or PARMS_DB_URI");
  }

  await mongoose.connect(uri);

  const products = await Product.find({
    isArchived: { $ne: true },
    $or: [
      { strength: { $exists: false } },
      { strength: null },
      { strength: "" },
    ],
  });

  let scanned = 0;
  let updated = 0;

  for (const product of products) {
    scanned += 1;

    const inferredFromName = extractStrengthFromText(product.name);
    const inferredFromKnownMap = KNOWN_STRENGTH_BY_NAME[normalizeName(product.name)] || null;
    const nextStrength = inferredFromName || inferredFromKnownMap;

    if (!nextStrength) {
      continue;
    }

    product.strength = String(nextStrength).trim();
    await product.save();
    updated += 1;
  }

  console.log(JSON.stringify({ scanned, updated }, null, 2));

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Strength backfill failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
