const fetch = require('node-fetch');

const BACKEND_URL = 'https://ai-ide-5.onrender.com';

async function testBackendConnection() {
  console.log('🔍 Testing Backend Connection...\n');
  
  try {
    // Test basic connectivity
    console.log('1. Testing basic connectivity...');
    const healthResponse = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.text();
      console.log('✅ Backend is accessible');
      console.log('Health response:', healthData);
    } else {
      console.log(`⚠️ Health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Health check error: ${error.message}`);
  }
  
  try {
    // Test logs endpoint
    console.log('\n2. Testing logs endpoint...');
    const logsResponse = await fetch(`${BACKEND_URL}/logs`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (logsResponse.ok) {
      const logs = await logsResponse.text();
      console.log('✅ Logs endpoint accessible');
      console.log('Recent logs:');
      console.log('='.repeat(50));
      console.log(logs);
      console.log('='.repeat(50));
    } else {
      console.log(`⚠️ Logs endpoint failed: ${logsResponse.status} ${logsResponse.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Logs endpoint error: ${error.message}`);
  }
  
  try {
    // Test files endpoint
    console.log('\n3. Testing files endpoint...');
    const filesResponse = await fetch(`${BACKEND_URL}/files`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (filesResponse.ok) {
      const filesData = await filesResponse.json();
      console.log('✅ Files endpoint accessible');
      console.log('Files data:', JSON.stringify(filesData, null, 2));
    } else {
      console.log(`⚠️ Files endpoint failed: ${filesResponse.status} ${filesResponse.statusText}`);
    }
    
  } catch (error) {
    console.log(`❌ Files endpoint error: ${error.message}`);
  }
  
  try {
    // Test workspace upload endpoint
    console.log('\n4. Testing workspace upload endpoint...');
    const testPayload = {
      files: [
        { path: 'test.js', content: 'console.log("test");' }
      ],
      sessionId: 'test-session'
    };
    
    const uploadResponse = await fetch(`${BACKEND_URL}/files/workspace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': 'test-session'
      },
      body: JSON.stringify(testPayload),
      timeout: 10000
    });
    
    if (uploadResponse.ok) {
      const uploadData = await uploadResponse.json();
      console.log('✅ Workspace upload endpoint accessible');
      console.log('Upload response:', JSON.stringify(uploadData, null, 2));
    } else {
      console.log(`⚠️ Workspace upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      const errorText = await uploadResponse.text();
      console.log('Error details:', errorText);
    }
    
  } catch (error) {
    console.log(`❌ Workspace upload error: ${error.message}`);
  }
  
  console.log('\n🎉 Backend connection test completed!');
}

// Run the test
testBackendConnection().catch(console.error);

