export const INVENTORY_TIME_PERIOD_DATA = {
    'Last Week': {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        categories: {
            medications: { inStock: 450, lowStock: 15, outOfStock: 3 },
            medicalSupplies: { inStock: 320, lowStock: 8, outOfStock: 2 },
            diagnosticKits: { inStock: 180, lowStock: 3, outOfStock: 1 },
            vaccines: { inStock: 67, lowStock: 2, outOfStock: 0 }
        },
        topProducts: {
            'Paracetamol': 120,
            'Amoxicillin': 180,
            'Masks': 95,
            'Losartan': 85,
            'Metformin': 70
        },
        usageTrend: {
            medications: [45, 52, 38, 48, 42, 58, 35],
            vaccines: [32, 28, 35, 22, 38, 18, 32],
            medicalSupplies: [28, 35, 25, 42, 28, 35, 30],
            diagnosticKits: [38, 42, 32, 35, 38, 22, 35]
        },
        stats: {
            totalItems: 1045,
            inStockItems: 1017,
            lowStockItems: 28,
            outOfStockItems: 6,
            totalItemsTrend: 'up',
            totalItemsTrendPercent: '2.3%',
            inStockTrend: 'up',
            inStockTrendPercent: '1.8%',
            lowStockTrend: 'down',
            lowStockTrendPercent: '5.2%',
            outOfStockTrend: 'down',
            outOfStockTrendPercent: '33.3%'
        }
    },
    'Last Month': {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        categories: {
            medications: { inStock: 480, lowStock: 18, outOfStock: 4 },
            medicalSupplies: { inStock: 350, lowStock: 10, outOfStock: 3 },
            diagnosticKits: { inStock: 200, lowStock: 5, outOfStock: 2 },
            vaccines: { inStock: 75, lowStock: 3, outOfStock: 1 }
        },
        topProducts: {
            'Paracetamol': 520,
            'Amoxicillin': 680,
            'Masks': 420,
            'Losartan': 380,
            'Metformin': 320
        },
        usageTrend: {
            medications: [220, 245, 198, 268],
            vaccines: [156, 142, 168, 128],
            medicalSupplies: [168, 195, 148, 218],
            diagnosticKits: [188, 202, 168, 195]
        },
        stats: {
            totalItems: 1105,
            inStockItems: 1075,
            lowStockItems: 36,
            outOfStockItems: 10,
            totalItemsTrend: 'up',
            totalItemsTrendPercent: '5.7%',
            inStockTrend: 'up',
            inStockTrendPercent: '5.7%',
            lowStockTrend: 'up',
            lowStockTrendPercent: '28.6%',
            outOfStockTrend: 'up',
            outOfStockTrendPercent: '66.7%'
        }
    },
    'Last 3 Months': {
        labels: ['Month 1', 'Month 2', 'Month 3'],
        categories: {
            medications: { inStock: 520, lowStock: 22, outOfStock: 5 },
            medicalSupplies: { inStock: 380, lowStock: 12, outOfStock: 4 },
            diagnosticKits: { inStock: 220, lowStock: 6, outOfStock: 3 },
            vaccines: { inStock: 85, lowStock: 4, outOfStock: 2 }
        },
        topProducts: {
            'Paracetamol': 1680,
            'Amoxicillin': 2120,
            'Masks': 1380,
            'Losartan': 1180,
            'Metformin': 980
        },
        usageTrend: {
            medications: [880, 980, 920],
            vaccines: [620, 580, 640],
            medicalSupplies: [720, 780, 750],
            diagnosticKits: [680, 720, 700]
        },
        stats: {
            totalItems: 1205,
            inStockItems: 1165,
            lowStockItems: 44,
            outOfStockItems: 14,
            totalItemsTrend: 'up',
            totalItemsTrendPercent: '15.3%',
            inStockTrend: 'up',
            inStockTrendPercent: '14.6%',
            lowStockTrend: 'up',
            lowStockTrendPercent: '57.1%',
            outOfStockTrend: 'up',
            outOfStockTrendPercent: '133.3%'
        }
    },
    'Last 6 Months': {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        categories: {
            medications: { inStock: 550, lowStock: 25, outOfStock: 6 },
            medicalSupplies: { inStock: 400, lowStock: 15, outOfStock: 5 },
            diagnosticKits: { inStock: 240, lowStock: 8, outOfStock: 4 },
            vaccines: { inStock: 95, lowStock: 5, outOfStock: 3 }
        },
        topProducts: {
            'Paracetamol': 3280,
            'Amoxicillin': 4160,
            'Masks': 2720,
            'Losartan': 2320,
            'Metformin': 1920
        },
        usageTrend: {
            medications: [1680, 1880, 1720, 1960, 1840, 2120],
            vaccines: [1180, 1080, 1240, 1120, 1280, 1360],
            medicalSupplies: [1380, 1480, 1420, 1560, 1500, 1680],
            diagnosticKits: [1280, 1380, 1320, 1440, 1400, 1580]
        },
        stats: {
            totalItems: 1285,
            inStockItems: 1245,
            lowStockItems: 53,
            outOfStockItems: 18,
            totalItemsTrend: 'up',
            totalItemsTrendPercent: '23.0%',
            inStockTrend: 'up',
            inStockTrendPercent: '22.5%',
            lowStockTrend: 'up',
            lowStockTrendPercent: '89.3%',
            outOfStockTrend: 'up',
            outOfStockTrendPercent: '200.0%'
        }
    },
    'This Year': {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        categories: {
            medications: { inStock: 600, lowStock: 30, outOfStock: 8 },
            medicalSupplies: { inStock: 450, lowStock: 18, outOfStock: 6 },
            diagnosticKits: { inStock: 260, lowStock: 10, outOfStock: 5 },
            vaccines: { inStock: 105, lowStock: 6, outOfStock: 4 }
        },
        topProducts: {
            'Paracetamol': 6880,
            'Amoxicillin': 8720,
            'Masks': 5720,
            'Losartan': 4880,
            'Metformin': 4040
        },
        usageTrend: {
            medications: [3520, 3920, 3680, 4160, 3920, 4480, 4240, 4720, 4480, 4960, 4720, 5200],
            vaccines: [2480, 2280, 2640, 2360, 2720, 2880, 3040, 3240, 3400, 3600, 3760, 3920],
            medicalSupplies: [2920, 3120, 3000, 3280, 3160, 3520, 3400, 3760, 3640, 4000, 3880, 4240],
            diagnosticKits: [2720, 2920, 2800, 3040, 2960, 3280, 3200, 3520, 3440, 3760, 3680, 4040]
        },
        stats: {
            totalItems: 1415,
            inStockItems: 1365,
            lowStockItems: 64,
            outOfStockItems: 23,
            totalItemsTrend: 'up',
            totalItemsTrendPercent: '35.4%',
            inStockTrend: 'up',
            inStockTrendPercent: '34.2%',
            lowStockTrend: 'up',
            lowStockTrendPercent: '128.6%',
            outOfStockTrend: 'up',
            outOfStockTrendPercent: '283.3%'
        }
    }
};

export const INVENTORY_TABLE_DATA = [
    { category: 'Medications', subCategory: 'Pain Relief', item: 'Paracetamol 500mg', currentStock: 245, reorderLevel: 50, status: 'In Stock' },
    { category: 'Medications', subCategory: 'Antibiotics', item: 'Amoxicillin 500mg', currentStock: 180, reorderLevel: 40, status: 'In Stock' },
    { category: 'Medical Supplies', subCategory: 'PPE', item: 'Face Masks (Box)', currentStock: 35, reorderLevel: 40, status: 'Low Stock' },
    { category: 'Medications', subCategory: 'Cardiovascular', item: 'Losartan 50mg', currentStock: 85, reorderLevel: 30, status: 'In Stock' },
    { category: 'Diagnostic Kits', subCategory: 'Testing', item: 'COVID-19 Test Kit', currentStock: 12, reorderLevel: 20, status: 'Low Stock' },
    { category: 'Vaccines', subCategory: 'Immunization', item: 'Influenza Vaccine', currentStock: 0, reorderLevel: 25, status: 'Out of Stock' }
];