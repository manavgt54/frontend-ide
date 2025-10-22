// tests/global-setup.js
import { getTestPool, cleanupTestData } from './db-helper.js';

async function globalSetup() {
  console.log('🔧 Starting global setup...');
  
  // Initialize database connection
  let dbAvailable = false;
  try {
    console.log('🗄️ Initializing database connection...');
    await getTestPool();
    console.log('✅ Database connection established');
    dbAvailable = true;
    
    // Clean up any existing test data
    await cleanupTestData();
  } catch (error) {
    console.log(`❌ Database connection failed: ${error.message}`);
    console.log('⚠️ Tests will run without database access');
  }
  
  console.log('🔍 Checking backend availability...');
  
  // Check deployed backend first
  try {
    const response = await fetch('https://ai-ide-5.onrender.com/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Deployed backend server is available');
      console.log(`   URL: https://ai-ide-5.onrender.com`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Sessions: ${data.sessions}`);
      process.env.BACKEND_AVAILABLE = 'true';
      process.env.BACKEND_URL = 'https://ai-ide-5.onrender.com';
      
      // Set database availability
      process.env.DB_AVAILABLE = dbAvailable.toString();
      
      if (dbAvailable) {
        console.log('🎯 Tests will run with full backend and database integration');
      } else {
        console.log('🎯 Tests will run with backend integration (no database)');
      }
      return;
    }
  } catch (error) {
    console.log('⚠️ Deployed backend not responding, checking local...');
  }
  
  // Fallback to local backend
  try {
    const response = await fetch('http://localhost:8000/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Local backend server is running on port 8000');
      console.log(`   Status: ${data.status}`);
      console.log(`   Sessions: ${data.sessions}`);
      process.env.BACKEND_AVAILABLE = 'true';
      process.env.BACKEND_URL = 'http://localhost:8000';
    } else {
      console.log('⚠️ Local backend server not responding');
      process.env.BACKEND_AVAILABLE = 'false';
    }
  } catch (error) {
    console.log('⚠️ No backend server available - tests will run in frontend-only mode');
    console.log(`   Error: ${error.message}`);
    process.env.BACKEND_AVAILABLE = 'false';
  }

  // Check frontend availability
  try {
    const response = await fetch('http://localhost:5173');
    if (response.ok) {
      console.log('✅ Frontend server is running on port 5173');
      process.env.FRONTEND_AVAILABLE = 'true';
    } else {
      console.log('⚠️ Frontend server not responding on port 5173');
      process.env.FRONTEND_AVAILABLE = 'false';
    }
  } catch (error) {
    console.log('⚠️ Frontend server not available');
    console.log(`   Error: ${error.message}`);
    process.env.FRONTEND_AVAILABLE = 'false';
  }

  // Set database availability
  process.env.DB_AVAILABLE = dbAvailable.toString();
  
  if (process.env.BACKEND_AVAILABLE === 'true' && dbAvailable) {
    console.log('🎯 Tests will run with full backend and database integration');
  } else if (process.env.BACKEND_AVAILABLE === 'true') {
    console.log('🎯 Tests will run with backend integration (no database)');
  } else if (dbAvailable) {
    console.log('🎯 Tests will run with database access (no backend)');
  } else {
    console.log('⚠️ Tests will run in frontend-only mode');
  }

  console.log('🔧 Global setup completed');
}

export default globalSetup;
