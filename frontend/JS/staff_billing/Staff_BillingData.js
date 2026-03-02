export const billingItems = [
  { id: 1, name: "Amoxicillin 500mg", category: "Medicines", price: 15.0, stock: 124 },
  { id: 2, name: "Mefenamic Acid 500mg", category: "Medicines", price: 12.0, stock: 210 },
  { id: 3, name: "Paracetamol 500mg", category: "Medicines", price: 6.0, stock: 0 },
  { id: 4, name: "Cetirizine 10mg", category: "Medicines", price: 8.5, stock: 45 },

  { id: 5, name: "Gauze Pad 4×4", category: "Medical Supplies", price: 15.0, stock: 124 },
  { id: 6, name: "Micropore Tape 1\"", category: "Medical Supplies", price: 65.0, stock: 12 },
  { id: 7, name: "Ethyl Alcohol 500ml", category: "Medical Supplies", price: 55.0, stock: 36 },
  { id: 8, name: "Disposable Syringe 5ml", category: "Medical Supplies", price: 10.0, stock: 300 },

  { id: 9, name: "Digital Weighing Scale", category: "Medical Equipment", price: 1450.0, stock: 6 },
  { id: 10, name: "Nebulizer Set", category: "Medical Equipment", price: 2100.0, stock: 8 },
  { id: 11, name: "Blood Pressure Monitor", category: "Medical Equipment", price: 1250.0, stock: 14 },

  { id: 12, name: "Urinalysis Test Kit", category: "Diagnostic Kits", price: 250.0, stock: 40 },
  { id: 13, name: "Glucose Test Strips", category: "Diagnostic Kits", price: 350.0, stock: 88 },
  { id: 14, name: "COVID-19 Antigen Kit", category: "Diagnostic Kits", price: 180.0, stock: 64 },

  { id: 15, name: "Ascorbic Acid (Vit C)", category: "General Supplies", price: 7.0, stock: 5 },
  { id: 16, name: "Face Mask (Box)", category: "General Supplies", price: 120.0, stock: 22 },
  { id: 17, name: "Disposable Gloves (Pair)", category: "General Supplies", price: 18.0, stock: 130 }
];

export const mockTransactions = [
  {
    transactionId: "TRID-98765432",
    date: "2/6/2026",
    time: "15:30",
    itemsCount: 2,
    patientId: "SAMPLE-XXX",
    totalAmount: 425.5
  },
  {
    transactionId: "TRID-98765431",
    date: "2/6/2026",
    time: "9:56",
    itemsCount: 1,
    patientId: "SAMPLE-XXX",
    totalAmount: 99.99
  },
  {
    transactionId: "TRID-98765430",
    date: "2/6/2026",
    time: "8:23",
    itemsCount: 4,
    patientId: "SAMPLE-XXX",
    totalAmount: 213.0
  },
  {
    transactionId: "TRID-98765429",
    date: "2/6/2026",
    time: "7:34",
    itemsCount: 3,
    patientId: "SAMPLE-XXX",
    totalAmount: 87.5
  },
  {
    transactionId: "TRID-98765428",
    date: "2/6/2026",
    time: "7:28",
    itemsCount: 3,
    patientId: "SAMPLE-XXX",
    totalAmount: 99.99
  },
  {
    transactionId: "TRID-98765427",
    date: "2/6/2026",
    time: "6:50",
    itemsCount: 6,
    patientId: "SAMPLE-XXX",
    totalAmount: 156.0
  },
  {
    transactionId: "TRID-98765426",
    date: "2/6/2026",
    time: "5:30",
    itemsCount: 2,
    patientId: "SAMPLE-XXX",
    totalAmount: 52.0
  }
];