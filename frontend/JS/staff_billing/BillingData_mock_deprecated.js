export const products = [
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

export const transactionHistory = [
	{
		transactionId: "TRID-98765432",
		date: "2/6/2026",
		time: "15:30",
		items: [
			{ productId: 2, name: "Mefenamic Acid 500mg", qty: 5, price: 12, lineTotal: 60 },
			{ productId: 6, name: "Micropore Tape 1\"", qty: 4, price: 65, lineTotal: 260 }
		],
		patientId: "PAT-100001",
		subtotal: 320,
		discount: 0,
		vat: 38.4,
		total: 358.4,
		status: "COMPLETED"
	}
];

export const heldTransactions = [];
