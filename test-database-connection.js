import DatabaseLogger from './database-logger.js';

async function testDatabaseConnection() {
  console.log('🗄️ Testing Aiven MySQL Database Connection...\n');
  
  const logger = new DatabaseLogger();
  
  try {
    // Test connection
    const connected = await logger.connect();
    if (!connected) {
      console.log('❌ Database connection failed');
      return;
    }
    
    console.log('✅ Database connection successful!\n');
    
    // Get basic stats
    await logger.getDatabaseStats();
    
    // Get recent activity
    await logger.getRecentActivity(24);
    
    // Test search functionality
    await logger.searchFiles('test');
    
    console.log('\n✅ Database connection test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await logger.disconnect();
  }
}

// Run the test
testDatabaseConnection();
