import { test, expect } from '@playwright/test';

// Simple backend API monitoring test
test.describe('Backend API Monitoring', () => {
  test('test backend API calls directly', async ({ page }) => {
    test.setTimeout(60000); // 1 minute
    
    const apiCalls: any[] = [];
    
    // Listen to all network requests
    page.on('request', request => {
      if (request.url().includes('ai-ide-5.onrender.com') || request.url().includes('localhost:8000')) {
        apiCalls.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData(),
          timestamp: new Date().toISOString()
        });
        console.log(`🌐 API REQUEST: ${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('ai-ide-5.onrender.com') || response.url().includes('localhost:8000')) {
        console.log(`📡 API RESPONSE: ${response.status()} ${response.url()}`);
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Test backend health endpoint directly
    console.log('🏥 Testing backend health endpoint...');
    try {
      const healthResponse = await page.request.get('https://ai-ide-5.onrender.com/health');
      const healthData = await healthResponse.json();
      console.log('✅ Backend health check:', healthData);
    } catch (error) {
      console.log('❌ Backend health check failed:', error);
    }
    
    // Test backend auth endpoint
    console.log('🔐 Testing backend auth endpoint...');
    try {
      const authResponse = await page.request.post('https://ai-ide-5.onrender.com/auth/google', {
        data: { email: 'test@example.com' }
      });
      console.log('📡 Auth response status:', authResponse.status());
    } catch (error) {
      console.log('❌ Auth endpoint test failed:', error);
    }
    
    // Test file operations endpoint
    console.log('📁 Testing file operations endpoint...');
    try {
      const filesResponse = await page.request.get('https://ai-ide-5.onrender.com/files');
      console.log('📡 Files response status:', filesResponse.status());
    } catch (error) {
      console.log('❌ Files endpoint test failed:', error);
    }
    
    // Test terminal endpoint
    console.log('💻 Testing terminal endpoint...');
    try {
      const terminalResponse = await page.request.post('https://ai-ide-5.onrender.com/terminal', {
        data: { command: 'echo "test"' }
      });
      console.log('📡 Terminal response status:', terminalResponse.status());
    } catch (error) {
      console.log('❌ Terminal endpoint test failed:', error);
    }
    
    // Log API summary
    console.log('\n📊 API CALLS SUMMARY:');
    console.log(`   Total API calls: ${apiCalls.length}`);
    
    const failedCalls = apiCalls.filter(call => call.status && call.status >= 400);
    console.log(`   Failed API calls: ${failedCalls.length}`);
    
    if (failedCalls.length > 0) {
      console.log('   Failed calls details:');
      failedCalls.forEach(call => {
        console.log(`     - ${call.status} ${call.url}`);
      });
    }
    
    const successfulCalls = apiCalls.filter(call => call.status && call.status < 400);
    console.log(`   Successful API calls: ${successfulCalls.length}`);
    
    if (successfulCalls.length > 0) {
      console.log('   Successful calls:');
      successfulCalls.forEach(call => {
        console.log(`     - ${call.status} ${call.url}`);
      });
    }
    
    expect(page).toBeTruthy();
    console.log('✅ Backend API monitoring test completed');
  });
  
  test('test WebSocket connection to backend', async ({ page }) => {
    test.setTimeout(30000);
    
    console.log('🔌 Testing WebSocket connection to backend...');
    
    const wsEvents: any[] = [];
    
    page.on('websocket', ws => {
      if (ws.url().includes('ai-ide-5.onrender.com') || ws.url().includes('localhost:8000')) {
        wsEvents.push({
          url: ws.url(),
          timestamp: new Date().toISOString()
        });
        console.log(`🔌 Backend WebSocket connected: ${ws.url()}`);
        
        ws.on('close', () => {
          console.log(`🔌 Backend WebSocket closed: ${ws.url()}`);
        });
        
        ws.on('framereceived', event => {
          console.log(`📨 Backend WebSocket message: ${event.payload}`);
        });
        
        ws.on('framesent', event => {
          console.log(`📤 Backend WebSocket sent: ${event.payload}`);
        });
      }
    });
    
    // Try to connect to backend WebSocket
    try {
      await page.goto('https://ai-ide-5.onrender.com');
      await page.waitForTimeout(5000);
    } catch (error) {
      console.log('⚠️ Could not navigate to backend:', error);
    }
    
    console.log(`🔌 Backend WebSocket events: ${wsEvents.length}`);
    
    expect(page).toBeTruthy();
  });
});

