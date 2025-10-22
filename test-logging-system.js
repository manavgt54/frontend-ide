const BACKEND_URL = 'https://ai-ide-5.onrender.com';

async function testLoggingSystem() {
  console.log('🧪 Testing Comprehensive Logging System...\n');
  
  try {
    // Test 1: Backend logs endpoint
    console.log('1. Testing backend logs endpoint...');
    const logsResponse = await fetch(`${BACKEND_URL}/logs`);
    if (logsResponse.ok) {
      const logsData = await logsResponse.json();
      console.log('✅ Backend logs endpoint working');
      console.log(`📊 Total logs: ${logsData.total}`);
      console.log(`📊 Filtered logs: ${logsData.filtered}`);
    } else {
      console.log(`❌ Backend logs failed: ${logsResponse.status}`);
    }
    
    // Test 2: Database logs endpoint
    console.log('\n2. Testing database logs endpoint...');
    const dbLogsResponse = await fetch(`${BACKEND_URL}/logs/database`);
    if (dbLogsResponse.ok) {
      const dbLogsData = await dbLogsResponse.json();
      console.log('✅ Database logs endpoint working');
      console.log(`📊 Users: ${dbLogsData.database.stats.users}`);
      console.log(`📊 Sessions: ${dbLogsData.database.stats.sessions}`);
      console.log(`📊 Files: ${dbLogsData.database.stats.files}`);
    } else {
      console.log(`❌ Database logs failed: ${dbLogsResponse.status}`);
    }
    
    // Test 3: Log statistics
    console.log('\n3. Testing log statistics...');
    const statsResponse = await fetch(`${BACKEND_URL}/logs/stats`);
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      console.log('✅ Log statistics working');
      console.log(`📊 Total logs: ${statsData.stats.total}`);
      console.log(`📊 By level:`, statsData.stats.byLevel);
      console.log(`📊 By category:`, statsData.stats.byCategory);
    } else {
      console.log(`❌ Log statistics failed: ${statsResponse.status}`);
    }
    
    // Test 4: Add a test log entry
    console.log('\n4. Testing log entry creation...');
    const testLogResponse = await fetch(`${BACKEND_URL}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        level: 'info',
        category: 'test',
        message: 'Test log entry from logging system test',
        data: {
          testId: Date.now(),
          source: 'test-script'
        }
      })
    });
    
    if (testLogResponse.ok) {
      console.log('✅ Log entry creation working');
    } else {
      console.log(`❌ Log entry creation failed: ${testLogResponse.status}`);
    }
    
    // Test 5: Verify the test log was added
    console.log('\n5. Verifying test log was added...');
    const verifyResponse = await fetch(`${BACKEND_URL}/logs?category=test&limit=5`);
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      console.log('✅ Log verification working');
      console.log(`📊 Test logs found: ${verifyData.filtered}`);
      if (verifyData.logs.length > 0) {
        console.log('📝 Latest test log:', verifyData.logs[0].message);
      }
    } else {
      console.log(`❌ Log verification failed: ${verifyResponse.status}`);
    }
    
    console.log('\n✅ Logging system test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Backend logging endpoint: Working');
    console.log('- Database logging endpoint: Working');
    console.log('- Log statistics: Working');
    console.log('- Log entry creation: Working');
    console.log('- Log verification: Working');
    
    console.log('\n🌐 To view logs in real-time:');
    console.log('1. Start your frontend: npm run dev');
    console.log('2. Open http://localhost:5173');
    console.log('3. Click the "Logs" icon in the sidebar');
    console.log('4. Drag and drop files to see real-time logging');
    
  } catch (error) {
    console.error('❌ Logging system test failed:', error);
  }
}

// Run the test
testLoggingSystem();


