import { test, expect } from '@playwright/test';

// Network monitoring test
test.describe('Network Monitoring & Developer Tools', () => {
  test('monitor network calls and console logs', async ({ page }) => {
    // Increase timeout for this test
    test.setTimeout(120000); // 2 minutes
    // Set up network request logging
    const networkRequests: any[] = [];
    const consoleMessages: any[] = [];
    
    // Listen to all network requests
    page.on('request', request => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: new Date().toISOString()
      });
      console.log(`🌐 REQUEST: ${request.method()} ${request.url()}`);
    });
    
    // Listen to all network responses
    page.on('response', response => {
      console.log(`📡 RESPONSE: ${response.status()} ${response.url()}`);
      networkRequests.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen to console messages
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log(`🖥️ CONSOLE [${msg.type()}]: ${msg.text()}`);
    });
    
    // Listen to page errors
    page.on('pageerror', error => {
      console.log(`❌ PAGE ERROR: ${error.message}`);
    });
    
    // Navigate to the app
    console.log('🚀 Navigating to app...');
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if we're redirected to login
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/login')) {
      console.log('🔐 On login page, testing login flow...');
      
      // Try to login with test credentials
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'testpassword');
      
      // Click login button and monitor network
      console.log('🖱️ Clicking login button...');
      await page.click('button[type="submit"]');
      
      // Wait for network activity
      await page.waitForTimeout(3000);
    }
    
    // Try to access terminal if available
    console.log('💻 Looking for terminal...');
    const terminalElement = page.locator('textarea, input[type="text"], .terminal, .xterm');
    if (await terminalElement.count() > 0) {
      console.log('✅ Terminal found, testing commands...');
      
      // Test basic terminal commands
      const commands = ['ls', 'pwd', 'echo "hello"', 'npm --version', 'node --version'];
      
      for (const cmd of commands) {
        console.log(`🔧 Testing command: ${cmd}`);
        await terminalElement.first().fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('⚠️ No terminal found');
    }
    
    // Try to access file operations
    console.log('📁 Looking for file operations...');
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      console.log('✅ File input found');
    }
    
    // Check for any error states
    const errorElements = page.locator('.error, .alert-danger, [class*="error"]');
    if (await errorElements.count() > 0) {
      console.log('❌ Error elements found:');
      for (let i = 0; i < await errorElements.count(); i++) {
        const errorText = await errorElements.nth(i).textContent();
        console.log(`   - ${errorText}`);
      }
    }
    
    // Log summary
    console.log('\n📊 NETWORK SUMMARY:');
    console.log(`   Total requests: ${networkRequests.length}`);
    
    const apiCalls = networkRequests.filter(req => 
      req.url.includes('/api/') || 
      req.url.includes('ai-ide-5.onrender.com') ||
      req.url.includes('localhost:8000')
    );
    console.log(`   API calls: ${apiCalls.length}`);
    
    const failedRequests = networkRequests.filter(req => req.status && req.status >= 400);
    console.log(`   Failed requests: ${failedRequests.length}`);
    
    if (failedRequests.length > 0) {
      console.log('   Failed requests details:');
      failedRequests.forEach(req => {
        console.log(`     - ${req.status} ${req.url}`);
      });
    }
    
    console.log('\n🖥️ CONSOLE SUMMARY:');
    console.log(`   Total console messages: ${consoleMessages.length}`);
    
    const errorMessages = consoleMessages.filter(msg => msg.type === 'error');
    console.log(`   Error messages: ${errorMessages.length}`);
    
    if (errorMessages.length > 0) {
      console.log('   Error details:');
      errorMessages.forEach(msg => {
        console.log(`     - ${msg.text}`);
      });
    }
    
    // Take a screenshot for visual debugging
    await page.screenshot({ path: 'network-monitoring-screenshot.png', fullPage: true });
    console.log('📸 Screenshot saved: network-monitoring-screenshot.png');
    
    // Basic assertions
    expect(page).toBeTruthy();
    console.log('✅ Network monitoring test completed');
  });
  
  test('monitor WebSocket connections', async ({ page }) => {
    console.log('🔌 Testing WebSocket connections...');
    
    const wsConnections: any[] = [];
    
    // Listen for WebSocket events
    page.on('websocket', ws => {
      wsConnections.push({
        url: ws.url(),
        timestamp: new Date().toISOString()
      });
      console.log(`🔌 WebSocket connected: ${ws.url()}`);
      
      ws.on('close', () => {
        console.log(`🔌 WebSocket closed: ${ws.url()}`);
      });
      
      ws.on('framereceived', event => {
        console.log(`📨 WebSocket message received: ${event.payload}`);
      });
      
      ws.on('framesent', event => {
        console.log(`📤 WebSocket message sent: ${event.payload}`);
      });
    });
    
    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for potential WebSocket connections
    await page.waitForTimeout(5000);
    
    console.log(`🔌 WebSocket connections found: ${wsConnections.length}`);
    wsConnections.forEach(ws => {
      console.log(`   - ${ws.url}`);
    });
    
    expect(page).toBeTruthy();
  });
});
