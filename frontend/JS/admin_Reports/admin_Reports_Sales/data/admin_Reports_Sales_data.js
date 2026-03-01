// admin_Reports_Sales_data.js
// Raw data with exports

export const TIME_PERIOD_DATA = {
    'Last Week': {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        revenue: [8500, 12000, 7800, 11000, 9500, 13000, 8800],
        transactions: [25, 35, 20, 32, 28, 38, 26],
        stats: {
            totalRevenue: 62300,
            totalTransactions: 110,
            averageTransaction: 566,
            revenueTrend: 'up',
            revenueTrendPercent: '12.5%',
            transactionsTrend: 'down',
            transactionsTrendPercent: '2.1%',
            averageTrend: 'up',
            averageTrendPercent: '5.4%'
        }
    },
    'Last Month': {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        revenue: [45000, 52000, 48000, 58000],
        transactions: [180, 210, 195, 235],
        stats: {
            totalRevenue: 203000,
            totalTransactions: 820,
            averageTransaction: 248,
            revenueTrend: 'up',
            revenueTrendPercent: '8.3%',
            transactionsTrend: 'up',
            transactionsTrendPercent: '5.2%',
            averageTrend: 'down',
            averageTrendPercent: '1.8%'
        }
    },
    'Last 3 Months': {
        labels: ['Month 1', 'Month 2', 'Month 3'],
        revenue: [185000, 203000, 195000],
        transactions: [3100, 3400, 3250],
        stats: {
            totalRevenue: 583000,
            totalTransactions: 9750,
            averageTransaction: 60,
            revenueTrend: 'up',
            revenueTrendPercent: '15.7%',
            transactionsTrend: 'up',
            transactionsTrendPercent: '12.3%',
            averageTrend: 'up',
            averageTrendPercent: '3.1%'
        }
    },
    'Last 6 Months': {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        revenue: [175000, 185000, 190000, 195000, 203000, 210000],
        transactions: [2900, 3100, 3200, 3250, 3400, 3550],
        stats: {
            totalRevenue: 1158000,
            totalTransactions: 19400,
            averageTransaction: 60,
            revenueTrend: 'up',
            revenueTrendPercent: '20.1%',
            transactionsTrend: 'up',
            transactionsTrendPercent: '22.4%',
            averageTrend: 'down',
            averageTrendPercent: '1.9%'
        }
    },
    'This Year': {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        revenue: [175000, 185000, 190000, 195000, 203000, 210000, 215000, 220000, 225000, 230000, 235000, 240000],
        transactions: [2900, 3100, 3200, 3250, 3400, 3550, 3650, 3750, 3850, 3950, 4050, 4150],
        stats: {
            totalRevenue: 2523000,
            totalTransactions: 42650,
            averageTransaction: 59,
            revenueTrend: 'up',
            revenueTrendPercent: '25.3%',
            transactionsTrend: 'up',
            transactionsTrendPercent: '28.7%',
            averageTrend: 'down',
            averageTrendPercent: '2.7%'
        }
    }
};

export const SERVICES_CHART_DATA = {
    labels: ['Services', 'Products'],
    datasets: [{
        data: [43670, 19630],
        backgroundColor: ['#1e3a8a', '#3b82f6'],
        borderWidth: 0
    }]
};

export const TOP_SERVICES_CHART_DATA = {
    labels: ['Consultation', 'Diagnostics', 'Procedures', 'Vaccination', 'Others'],
    datasets: [{
        data: [35000, 25000, 15000, 12000, 8000],
        backgroundColor: ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa'],
        borderWidth: 0
    }]
};

export const TABLE_DATA = [
    { category: 'Services', subCategory: 'Consultation', item: 'General Check-up', timesAvailed: 120, totalRevenue: 72000 },
    { category: 'Services', subCategory: 'Diagnostics', item: 'Chest X-Ray', timesAvailed: 40, totalRevenue: 28000 },
    { category: 'Services', subCategory: 'Preventive Care', item: 'Flu Vaccination', timesAvailed: 40, totalRevenue: 20000 },
    { category: 'Products', subCategory: 'Medications', item: 'Paracetamol', timesAvailed: 200, totalRevenue: 15000 },
    { category: 'Products', subCategory: 'Medications', item: 'Amoxicillin', timesAvailed: 80, totalRevenue: 10000 },
    { category: 'Services', subCategory: 'Minor Procedure', item: 'Wound Dressing', timesAvailed: 10, totalRevenue: 12500 },
    { category: 'Products', subCategory: 'Supplies', item: 'Face Masks (Box)', timesAvailed: 60, totalRevenue: 9000 }
];