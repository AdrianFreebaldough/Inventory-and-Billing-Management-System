// Notification Cron Service
// This service runs scheduled tasks for checking inventory and creating notifications

import { 
  checkExpirationNotifications, 
  checkStockNotifications 
} from './expirationService.js';

class NotificationCronService {
  constructor() {
    this.intervals = [];
  }

  // Start all scheduled intervals
  start() {
    console.log('🕐 Starting notification cron service...');

    // Expiration check every 24 hours (86400000 ms)
    const expirationInterval = setInterval(async () => {
      console.log('🔔 Running daily expiration notification check...');
      try {
        await checkExpirationNotifications();
        console.log('✅ Expiration notifications check completed');
      } catch (error) {
        console.error('❌ Expiration notification check failed:', error);
      }
    }, 24 * 60 * 60 * 1000);

    // Stock level check every 6 hours (21600000 ms)
    const stockInterval = setInterval(async () => {
      console.log('🔔 Running stock level notification check...');
      try {
        await checkStockNotifications();
        console.log('✅ Stock notifications check completed');
      } catch (error) {
        console.error('❌ Stock notification check failed:', error);
      }
    }, 6 * 60 * 60 * 1000);

    this.intervals.push(expirationInterval, stockInterval);
    
    // Run initial checks on startup
    this.runNow().catch(err => console.error('Initial notification check failed:', err));
    
    console.log('✅ Notification cron service started');
    console.log('   - Expiration check: Every 24 hours');
    console.log('   - Stock check: Every 6 hours');
  }

  // Stop all scheduled intervals
  stop() {
    console.log('🛑 Stopping notification cron service...');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('✅ Notification cron service stopped');
  }

  // Run checks immediately (for testing)
  async runNow() {
    console.log('🔔 Running notification checks immediately...');
    
    try {
      await checkExpirationNotifications();
      console.log('✅ Expiration check completed');
      
      await checkStockNotifications();
      console.log('✅ Stock check completed');
    } catch (error) {
      console.error('❌ Notification check failed:', error);
    }
  }
}

export default NotificationCronService;

// Usage in server.js:
// import NotificationCronService from './notificationCronService.js';
// const cronService = new NotificationCronService();
// cronService.start();
