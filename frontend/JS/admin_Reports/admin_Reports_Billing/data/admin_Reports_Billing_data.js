export const BILLING_TIME_PERIOD_DATA = {
    'Last Week': {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        collectionTrend: {
            gross: [45000, 52000, 48000, 55000, 51000, 58000, 49000],
            discounts: [4500, 5200, 4800, 5500, 5100, 5800, 4900],
            net: [40500, 46800, 43200, 49500, 45900, 52200, 44100]
        },
        discountBreakdown: {
            statutory: 25000,
            senior: 15000,
            pwd: 8000
        },
        stats: {
            grossBilled: 358000,
            totalDiscounts: 35800,
            netCollection: 322200,
            avgTransaction: 1250,
            grossBilledTrend: 'up',
            grossBilledTrendPercent: '8.5%',
            totalDiscountsTrend: 'down',
            totalDiscountsTrendPercent: '3.2%',
            netCollectionTrend: 'up',
            netCollectionTrendPercent: '9.8%',
            avgTransactionTrend: 'up',
            avgTransactionTrendPercent: '2.1%'
        }
    },
    'Last Month': {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        collectionTrend: {
            gross: [180000, 195000, 210000, 188000],
            discounts: [18000, 19500, 21000, 18800],
            net: [162000, 175500, 189000, 169200]
        },
        discountBreakdown: {
            statutory: 95000,
            senior: 57000,
            pwd: 30400
        },
        stats: {
            grossBilled: 773000,
            totalDiscounts: 77300,
            netCollection: 695700,
            avgTransaction: 1280,
            grossBilledTrend: 'up',
            grossBilledTrendPercent: '12.3%',
            totalDiscountsTrend: 'up',
            totalDiscountsTrendPercent: '5.8%',
            netCollectionTrend: 'up',
            netCollectionTrendPercent: '11.5%',
            avgTransactionTrend: 'up',
            avgTransactionTrendPercent: '2.4%'
        }
    },
    'Last 6 Months': {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        collectionTrend: {
            gross: [650000, 720000, 680000, 750000, 820000, 780000],
            discounts: [65000, 72000, 68000, 75000, 82000, 78000],
            net: [585000, 648000, 612000, 675000, 738000, 702000]
        },
        discountBreakdown: {
            statutory: 325000,
            senior: 195000,
            pwd: 104000
        },
        stats: {
            grossBilled: 4400000,
            totalDiscounts: 440000,
            netCollection: 3960000,
            avgTransaction: 1320,
            grossBilledTrend: 'up',
            grossBilledTrendPercent: '18.5%',
            totalDiscountsTrend: 'up',
            totalDiscountsTrendPercent: '8.2%',
            netCollectionTrend: 'up',
            netCollectionTrendPercent: '20.1%',
            avgTransactionTrend: 'up',
            avgTransactionTrendPercent: '5.6%'
        }
    },
    'This Year': {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        collectionTrend: {
            gross: [2100000, 2450000, 2280000, 2650000],
            discounts: [210000, 245000, 228000, 265000],
            net: [1890000, 2205000, 2052000, 2385000]
        },
        discountBreakdown: {
            statutory: 1225000,
            senior: 735000,
            pwd: 392000
        },
        stats: {
            grossBilled: 9480000,
            totalDiscounts: 948000,
            netCollection: 8532000,
            avgTransaction: 1350,
            grossBilledTrend: 'up',
            grossBilledTrendPercent: '22.3%',
            totalDiscountsTrend: 'up',
            totalDiscountsTrendPercent: '15.8%',
            netCollectionTrend: 'up',
            netCollectionTrendPercent: '24.5%',
            avgTransactionTrend: 'up',
            avgTransactionTrendPercent: '8.0%'
        }
    }
};

export const BILLING_TABLE_DATA = {
    cashierRevenue: [
        { staff: 'Dr. Sarah Chen', netCollected: 125000, transactions: 98 },
        { staff: 'Dr. Miguel Santos', netCollected: 98000, transactions: 76 },
        { staff: 'Dr. Anna Reyes', netCollected: 87000, transactions: 68 }
    ],
    transactions: [
        { dateTime: '2025-01-15 09:30', orNumber: 'OR-2025-001', patientId: 'P-1001', gross: 2500, discount: { amount: 250, type: 'Senior' }, netCollected: 2250, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-15 10:15', orNumber: 'OR-2025-002', patientId: 'P-1002', gross: 1800, discount: { amount: 180, type: 'PWD' }, netCollected: 1620, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-15 11:00', orNumber: 'OR-2025-003', patientId: 'P-1003', gross: 3200, discount: { amount: 320, type: 'Senior' }, netCollected: 2880, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-15 11:45', orNumber: 'OR-2025-004', patientId: 'P-1004', gross: 1500, discount: { amount: 0, type: 'None' }, netCollected: 1500, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-15 14:20', orNumber: 'OR-2025-005', patientId: 'P-1005', gross: 4200, discount: { amount: 420, type: 'Statutory' }, netCollected: 3780, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-15 15:10', orNumber: 'OR-2025-006', patientId: 'P-1006', gross: 2800, discount: { amount: 280, type: 'Senior' }, netCollected: 2520, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-15 16:00', orNumber: 'OR-2025-007', patientId: 'P-1007', gross: 3500, discount: { amount: 350, type: 'PWD' }, netCollected: 3150, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-15 16:45', orNumber: 'OR-2025-008', patientId: 'P-1008', gross: 1900, discount: { amount: 190, type: 'Statutory' }, netCollected: 1710, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-15 17:30', orNumber: 'OR-2025-009', patientId: 'P-1009', gross: 2600, discount: { amount: 0, type: 'None' }, netCollected: 2600, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-15 18:15', orNumber: 'OR-2025-010', patientId: 'P-1010', gross: 3100, discount: { amount: 310, type: 'Senior' }, netCollected: 2790, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-16 08:45', orNumber: 'OR-2025-011', patientId: 'P-1011', gross: 2200, discount: { amount: 220, type: 'PWD' }, netCollected: 1980, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-16 09:30', orNumber: 'OR-2025-012', patientId: 'P-1012', gross: 3800, discount: { amount: 380, type: 'Statutory' }, netCollected: 3420, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-16 10:15', orNumber: 'OR-2025-013', patientId: 'P-1013', gross: 1600, discount: { amount: 160, type: 'Senior' }, netCollected: 1440, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-16 11:00', orNumber: 'OR-2025-014', patientId: 'P-1014', gross: 2900, discount: { amount: 0, type: 'None' }, netCollected: 2900, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-16 14:30', orNumber: 'OR-2025-015', patientId: 'P-1015', gross: 4100, discount: { amount: 410, type: 'PWD' }, netCollected: 3690, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-16 15:20', orNumber: 'OR-2025-016', patientId: 'P-1016', gross: 3300, discount: { amount: 330, type: 'Statutory' }, netCollected: 2970, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-16 16:10', orNumber: 'OR-2025-017', patientId: 'P-1017', gross: 2700, discount: { amount: 270, type: 'Senior' }, netCollected: 2430, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-16 17:00', orNumber: 'OR-2025-018', patientId: 'P-1018', gross: 3600, discount: { amount: 360, type: 'PWD' }, netCollected: 3240, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-16 17:45', orNumber: 'OR-2025-019', patientId: 'P-1019', gross: 2400, discount: { amount: 240, type: 'Statutory' }, netCollected: 2160, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-17 08:30', orNumber: 'OR-2025-020', patientId: 'P-1020', gross: 3000, discount: { amount: 300, type: 'Senior' }, netCollected: 2700, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-17 09:15', orNumber: 'OR-2025-021', patientId: 'P-1021', gross: 2100, discount: { amount: 210, type: 'PWD' }, netCollected: 1890, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-17 10:00', orNumber: 'OR-2025-022', patientId: 'P-1022', gross: 3700, discount: { amount: 370, type: 'Statutory' }, netCollected: 3330, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-17 10:45', orNumber: 'OR-2025-023', patientId: 'P-1023', gross: 1800, discount: { amount: 180, type: 'Senior' }, netCollected: 1620, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-17 11:30', orNumber: 'OR-2025-024', patientId: 'P-1024', gross: 3200, discount: { amount: 0, type: 'None' }, netCollected: 3200, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-17 14:00', orNumber: 'OR-2025-025', patientId: 'P-1025', gross: 4500, discount: { amount: 450, type: 'PWD' }, netCollected: 4050, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-17 14:45', orNumber: 'OR-2025-026', patientId: 'P-1026', gross: 2800, discount: { amount: 280, type: 'Statutory' }, netCollected: 2520, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-17 15:30', orNumber: 'OR-2025-027', patientId: 'P-1027', gross: 3400, discount: { amount: 340, type: 'Senior' }, netCollected: 3060, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-17 16:15', orNumber: 'OR-2025-028', patientId: 'P-1028', gross: 2300, discount: { amount: 230, type: 'PWD' }, netCollected: 2070, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-17 17:00', orNumber: 'OR-2025-029', patientId: 'P-1029', gross: 3900, discount: { amount: 390, type: 'Statutory' }, netCollected: 3510, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-17 17:45', orNumber: 'OR-2025-030', patientId: 'P-1030', gross: 2600, discount: { amount: 260, type: 'Senior' }, netCollected: 2340, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-18 08:15', orNumber: 'OR-2025-031', patientId: 'P-1031', gross: 3100, discount: { amount: 310, type: 'PWD' }, netCollected: 2790, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-18 09:00', orNumber: 'OR-2025-032', patientId: 'P-1032', gross: 2200, discount: { amount: 220, type: 'Statutory' }, netCollected: 1980, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-18 09:45', orNumber: 'OR-2025-033', patientId: 'P-1033', gross: 3800, discount: { amount: 380, type: 'Senior' }, netCollected: 3420, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-18 10:30', orNumber: 'OR-2025-034', patientId: 'P-1034', gross: 1700, discount: { amount: 170, type: 'PWD' }, netCollected: 1530, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-18 11:15', orNumber: 'OR-2025-035', patientId: 'P-1035', gross: 2900, discount: { amount: 0, type: 'None' }, netCollected: 2900, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-18 14:00', orNumber: 'OR-2025-036', patientId: 'P-1036', gross: 4200, discount: { amount: 420, type: 'Statutory' }, netCollected: 3780, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-18 14:45', orNumber: 'OR-2025-037', patientId: 'P-1037', gross: 3300, discount: { amount: 330, type: 'Senior' }, netCollected: 2970, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-18 15:30', orNumber: 'OR-2025-038', patientId: 'P-1038', gross: 2500, discount: { amount: 250, type: 'PWD' }, netCollected: 2250, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-18 16:15', orNumber: 'OR-2025-039', patientId: 'P-1039', gross: 3600, discount: { amount: 360, type: 'Statutory' }, netCollected: 3240, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-18 17:00', orNumber: 'OR-2025-040', patientId: 'P-1040', gross: 2800, discount: { amount: 280, type: 'Senior' }, netCollected: 2520, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-18 17:45', orNumber: 'OR-2025-041', patientId: 'P-1041', gross: 4100, discount: { amount: 410, type: 'PWD' }, netCollected: 3690, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-19 08:30', orNumber: 'OR-2025-042', patientId: 'P-1042', gross: 1900, discount: { amount: 190, type: 'Statutory' }, netCollected: 1710, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-19 09:15', orNumber: 'OR-2025-043', patientId: 'P-1043', gross: 3200, discount: { amount: 320, type: 'Senior' }, netCollected: 2880, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-19 10:00', orNumber: 'OR-2025-044', patientId: 'P-1044', gross: 2600, discount: { amount: 0, type: 'None' }, netCollected: 2600, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-19 10:45', orNumber: 'OR-2025-045', patientId: 'P-1045', gross: 3800, discount: { amount: 380, type: 'PWD' }, netCollected: 3420, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-19 11:30', orNumber: 'OR-2025-046', patientId: 'P-1046', gross: 2300, discount: { amount: 230, type: 'Statutory' }, netCollected: 2070, status: 'Paid', staff: 'Dr. Sarah Chen' },
        { dateTime: '2025-01-19 14:15', orNumber: 'OR-2025-047', patientId: 'P-1047', gross: 3400, discount: { amount: 340, type: 'Senior' }, netCollected: 3060, status: 'Paid', staff: 'Dr. Miguel Santos' },
        { dateTime: '2025-01-19 15:00', orNumber: 'OR-2025-048', patientId: 'P-1048', gross: 2900, discount: { amount: 290, type: 'PWD' }, netCollected: 2610, status: 'Paid', staff: 'Dr. Anna Reyes' },
        { dateTime: '2025-01-19 15:45', orNumber: 'OR-2025-049', patientId: 'P-1049', gross: 3600, discount: { amount: 360, type: 'Statutory' }, netCollected: 3240, status: 'Paid', staff: 'Dr. Sarah Chen' }
    ]
};