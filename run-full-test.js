import DatabaseLogger from './database-logger.js';
import fetch from 'node-fetch';

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'https://ai-ide-5.onrender.com';

console.log('🚀 FULL TEST SUITE: Backend + Database + Frontend');
console.log('='.repeat(60));

async function runFullTest() {
  const dbLogger = new DatabaseLogger();
  
  try {
    // Phase 1: Database Analysis
    console.log('\n📊 PHASE 1: DATABASE ANALYSIS');
    console.log('='.repeat(40));
    
    const connected = await dbLogger.connect();
    if (connected) {
      await dbLogger.getDatabaseStats();
      await dbLogger.getRecentActivity(1);
    }
    
    // Phase 2: Backend Analysis
    console.log('\n📡 PHASE 2: BACKEND ANALYSIS');
    console.log('='.repeat(40));
    
    try {
      const response = await fetch(`${BACKEND_URL}/logs`);
      if (response.ok) {
        const logs = await response.text();
        console.log('📋 Backend Logs:');
        console.log(logs);
      } else {
        console.log(`❌ Backend logs failed: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Backend error: ${error.message}`);
    }
    
    // Phase 3: Test File Upload
    console.log('\n🧪 PHASE 3: TEST FILE UPLOAD');
    console.log('='.repeat(40));
    
    const testSessionId = `test-${Date.now()}`;
    const testPayload = {
      files: [
        { path: 'test-file.js', content: 'console.log("Test upload from full test suite");' },
        { path: 'test-file.py', content: 'print("Python test file")' }
      ],
      sessionId: testSessionId
    };
    
    try {
      const uploadResponse = await fetch(`${BACKEND_URL}/files/workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': testSessionId
        },
        body: JSON.stringify(testPayload)
      });
      
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        console.log('✅ File upload successful!');
        console.log('Upload result:', JSON.stringify(result, null, 2));
        
        // Check if files were saved to database
        if (connected) {
          console.log('\n🔍 Checking database for uploaded files...');
          await dbLogger.getSessionDetails(testSessionId);
        }
      } else {
        console.log(`❌ File upload failed: ${uploadResponse.status}`);
        const errorText = await uploadResponse.text();
        console.log('Error:', errorText);
      }
    } catch (error) {
      console.log(`❌ Upload error: ${error.message}`);
    }
    
    // Phase 4: Final Analysis
    console.log('\n📊 PHASE 4: FINAL ANALYSIS');
    console.log('='.repeat(40));
    
    if (connected) {
      await dbLogger.getRecentActivity(1);
      await dbLogger.searchFiles('test');
    }
    
    console.log('\n✅ FULL TEST SUITE COMPLETED');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    await dbLogger.disconnect();
  }
}

// Run the full test
runFullTest();

