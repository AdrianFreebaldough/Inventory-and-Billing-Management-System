import mongoose from "mongoose";
import connectIBMS from "../database/database.js";
import Product from "../models/product.js";
import InventoryBatch from "../models/InventoryBatch.js";

const DEFAULT_STOCK = 500;
const DEFAULT_LAB_PRICE = 350;

const LAB_EXAM_CATALOG = [
  { id: "cbc", name: "Complete Blood Count (CBC)", code: "CBC", category: "Hematology" },
  { id: "esr", name: "Erythrocyte Sedimentation Rate (ESR)", code: "ESR", category: "Hematology" },
  { id: "platelet", name: "Platelet Count", code: "PLT", category: "Hematology" },
  { id: "urinalysis", name: "Urinalysis", code: "UA", category: "Urine and Renal" },
  { id: "serum-creatinine", name: "Serum Creatinine", code: "CREA", category: "Urine and Renal" },
  { id: "bun", name: "Blood Urea Nitrogen (BUN)", code: "BUN", category: "Urine and Renal" },
  { id: "fbs", name: "Fasting Blood Sugar", code: "FBS", category: "Chemistry" },
  { id: "hba1c", name: "Hemoglobin A1c", code: "HBA1C", category: "Chemistry" },
  { id: "lipid-profile", name: "Lipid Profile", code: "LIPID", category: "Chemistry" },
  { id: "sgpt", name: "SGPT (ALT)", code: "ALT", category: "Chemistry" },
  { id: "sgot", name: "SGOT (AST)", code: "AST", category: "Chemistry" },
  { id: "electrolytes", name: "Serum Electrolytes (Na, K, Cl)", code: "ELEC", category: "Chemistry" },
  { id: "xray-chest", name: "Chest X-ray", code: "CXR", category: "Imaging and Cardio" },
  { id: "ecg", name: "12-Lead ECG", code: "ECG", category: "Imaging and Cardio" },
  { id: "troponin", name: "Troponin I", code: "TNI", category: "Imaging and Cardio" },
  { id: "dengue-ns1", name: "Dengue NS1 Antigen", code: "DENGUE-NS1", category: "Infectious Disease" },
  { id: "malaria-smear", name: "Malaria Smear", code: "MALARIA", category: "Infectious Disease" },
  { id: "covid-antigen", name: "COVID-19 Antigen", code: "COVID-AG", category: "Infectious Disease" },
];

const BASE_SERVICE_ITEMS = [
  {
    name: "Follow-up",
    category: "Services",
    unitPrice: 500,
    description: "Return visit for ongoing care",
  },
  {
    name: "Consultation",
    category: "Services",
    unitPrice: 800,
    description: "First-time or general medical visit",
  },
  {
    name: "Routine Checkup",
    category: "Services",
    unitPrice: 1000,
    description: "Preventive health examination",
  },
  {
    name: "Vaccination",
    category: "Services",
    unitPrice: 1200,
    description: "Immunization or booster shot",
  },
  {
    name: "Other",
    category: "Services",
    unitPrice: 400,
    description: "Other medical concern",
  },
];

const LAB_SERVICE_ITEMS = LAB_EXAM_CATALOG.map((exam) => ({
  name: exam.name,
  category: "Lab Test",
  unitPrice: DEFAULT_LAB_PRICE,
  description: `Lab exam code ${exam.code} - ${exam.category}`,
}));

const SERVICE_ITEMS = [...BASE_SERVICE_ITEMS, ...LAB_SERVICE_ITEMS];
const TARGET_LAB_SERVICE_NAMES = new Set(
  LAB_SERVICE_ITEMS.map((item) => String(item.name || "").trim().toLowerCase())
);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getBatchTotal = (batch) => {
  const current = toNumber(batch?.currentQuantity);
  if (current > 0) return current;
  return Math.max(toNumber(batch?.quantity), 0);
};

const getOrCreateProduct = async (item) => {
  const existing = await Product.findOne({ name: item.name });
  if (existing) {
    existing.category = item.category;
    existing.unitPrice = item.unitPrice;
    existing.description = item.description;
    existing.unit = "service";
    existing.minStock = 1;
    existing.isArchived = false;
    if (toNumber(existing.quantity) <= 0) {
      existing.quantity = DEFAULT_STOCK;
    }
    await existing.save();
    return { product: existing, created: false };
  }

  const created = await Product.create({
    name: item.name,
    category: item.category,
    quantity: DEFAULT_STOCK,
    unitPrice: item.unitPrice,
    unit: "service",
    minStock: 1,
    supplier: "Clinic Services",
    description: item.description,
    status: "available",
    isArchived: false,
  });

  return { product: created, created: true };
};

const ensureSellableBatch = async ({ product, batchLabel }) => {
  const batches = await InventoryBatch.find({ product: product._id })
    .select("_id batchNumber quantity currentQuantity")
    .lean();

  const sellableBatch = batches.find((batch) => getBatchTotal(batch) > 0);

  if (!sellableBatch) {
    const now = new Date();
    const batchNumber = `SRV-${batchLabel}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    await InventoryBatch.create({
      product: product._id,
      batchNumber,
      quantity: DEFAULT_STOCK,
      currentQuantity: DEFAULT_STOCK,
      initialQuantity: DEFAULT_STOCK,
      expiryDate: null,
      supplier: "Clinic Services",
      notes: "Auto-generated service stock batch for billing transactions",
      status: "Active",
    });
  }

  const refreshedBatches = await InventoryBatch.find({ product: product._id })
    .select("quantity currentQuantity")
    .lean();

  const totalStock = refreshedBatches.reduce((sum, batch) => sum + getBatchTotal(batch), 0);
  product.quantity = totalStock > 0 ? totalStock : DEFAULT_STOCK;
  await product.save();
};

const archiveStaleLabServices = async () => {
  const existingLabProducts = await Product.find({
    $or: [
      { name: /^Lab\s*Test/i },
      { category: /^lab\s*test$/i },
    ],
    isArchived: { $ne: true },
  }).select("_id name isArchived");

  let archivedCount = 0;

  for (const product of existingLabProducts) {
    const normalizedName = String(product.name || "").trim().toLowerCase();
    if (TARGET_LAB_SERVICE_NAMES.has(normalizedName)) {
      continue;
    }

    product.isArchived = true;
    await product.save();
    archivedCount += 1;
  }

  return archivedCount;
};

const run = async () => {
  try {
    await connectIBMS();

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of SERVICE_ITEMS) {
      const { product, created } = await getOrCreateProduct(item);
      if (created) createdCount += 1;
      else updatedCount += 1;

      const batchLabel = item.name
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase()
        .slice(0, 20);

      await ensureSellableBatch({ product, batchLabel });
    }

    const archivedCount = await archiveStaleLabServices();

    console.log(`Service inventory seed complete. Created: ${createdCount}, Updated: ${updatedCount}, Archived stale labs: ${archivedCount}`);
  } catch (error) {
    console.error("Service inventory seeding failed:", error.message || error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();