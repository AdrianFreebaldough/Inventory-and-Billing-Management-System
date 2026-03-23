import mongoose from "mongoose";
import connectIBMS from "../database/database.js";
import Product from "../models/product.js";
import InventoryRequest from "../models/InventoryRequest.js";

const CATEGORY_MAP = {
  antibiotic: "Antibiotic",
  antibiotics: "Antibiotic",
  medicine: "Medicine",
  medicines: "Medicine",
  analgesic: "Analgesic",
  analgesics: "Analgesic",
  antipyretic: "Antipyretic",
  antipyretics: "Antipyretic",
  antihistamine: "Antihistamine",
  antihistamines: "Antihistamine",
  antacid: "Antacid",
  antacids: "Antacid",
  vitamin: "Vitamin",
  vitamins: "Vitamin",
  vaccine: "Vaccine",
  vaccines: "Vaccine",
  "first aid": "First Aid",
  "first aid medical supplies": "First Aid",
  "first aid and medical supplies": "First Aid",
  "personal care": "Personal Care",
};

const normalizeCategory = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalized) return "";

  return CATEGORY_MAP[normalized] || normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const normalizeCollectionCategories = async (Model, label) => {
  const docs = await Model.find({ category: { $exists: true, $type: "string" } })
    .select("_id category")
    .lean();

  let updates = 0;
  for (const doc of docs) {
    const current = String(doc.category || "").trim();
    const normalized = normalizeCategory(current);
    if (!normalized || current === normalized) continue;

    await Model.updateOne({ _id: doc._id }, { $set: { category: normalized } });
    updates += 1;
  }

  console.log(`${label}: normalized ${updates} document(s)`);
};

const run = async () => {
  try {
    await connectIBMS();
    await normalizeCollectionCategories(Product, "Product");
    await normalizeCollectionCategories(InventoryRequest, "InventoryRequest");
    console.log("Category normalization complete.");
  } catch (error) {
    console.error("Category normalization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
