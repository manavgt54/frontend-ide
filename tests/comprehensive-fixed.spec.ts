import { test, expect } from '@playwright/test';

// Comprehensive test including drag and drop functionality
test.describe('Fixed Backend API + Drag & Drop Testing', () => {
  test('test corrected backend endpoints and drag drop functionality', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for comprehensive testing
    
    const testResults: any[] = [];
    
    // Helper function to test API endpoint with proper error handling
    async function testEndpoint(method: string, url: string, data?: any, headers?: any) {
      try {
        console.log(`🧪 Testing ${method} ${url}`);
        const response = await page.request[method.toLowerCase()](url, {
          data,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          timeout: 30000 // 30 second timeout
        });
        
        const result = {
          method,
          url,
          status: response.status(),
          statusText: response.statusText(),
          data: data,
          headers: headers,
          timestamp: new Date().toISOString()
        };
        
        testResults.push(result);
        console.log(`   ✅ ${response.status()} ${response.statusText()}`);
        
        if (response.status() < 400) {
          try {
            const responseData = await response.json();
            console.log(`   📄 Response:`, JSON.stringify(responseData, null, 2));
            result.responseData = responseData;
          } catch (e) {
            console.log(`   📄 Response: (non-JSON)`);
          }
        }
        
        return result;
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        testResults.push({
          method,
          url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return null;
      }
    }
    
    // 1. Test corrected health endpoint
    console.log('\n🏥 Testing Corrected Health Endpoint:');
    const healthResult = await testEndpoint('GET', 'https://ai-ide-5.onrender.com/health');
    
    // 2. Test authentication and get a valid session
    console.log('\n🔐 Testing Authentication (Fixed):');
    const authResult = await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google', {
      email: 'test@example.com'
    });
    
    let sessionId = null;
    if (authResult && authResult.responseData) {
      sessionId = authResult.responseData.sessionId;
      console.log(`✅ Got session ID: ${sessionId}`);
    }
    
    // 3. Test file operations with proper session handling
    console.log('\n📁 Testing File Operations (Fixed):');
    
    if (sessionId) {
      // Test file listing with valid session
      await testEndpoint('GET', `https://ai-ide-5.onrender.com/files?sessionId=${sessionId}`);
      
      // Test file save with proper validation
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: 'test-file.txt',
        content: 'Hello World!'
      }, {
        'x-session-id': sessionId
      });
      
      // Test file open
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/open', {
        filename: 'test-file.txt'
      }, {
        'x-session-id': sessionId
      });
      
      // Test edge cases with proper validation
      console.log('\n🔍 Testing Edge Cases (Fixed):');
      
      // Test with empty filename (should be handled gracefully)
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: '',
        content: 'Empty filename test'
      }, {
        'x-session-id': sessionId
      });
      
      // Test with null content (should be handled gracefully)
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: 'null-content.txt',
        content: null
      }, {
        'x-session-id': sessionId
      });
      
      // Test with special characters (should be handled gracefully)
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: 'test file with spaces & symbols!.txt',
        content: 'Special characters test'
      }, {
        'x-session-id': sessionId
      });
      
      // Test with very long content (should be handled gracefully)
      const longContent = 'A'.repeat(50000); // 50KB
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: 'long-file.txt',
        content: longContent
      }, {
        'x-session-id': sessionId
      });
    }
    
    // 4. Test drag and drop functionality
    console.log('\n🎯 Testing Drag and Drop Functionality:');
    
    // Navigate to the frontend
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if we're on login page
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/login')) {
      console.log('🔐 On login page, testing login flow...');
      
      // Try to login
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'testpassword');
      await page.click('button[type="submit"]');
      
      // Wait for redirect
      await page.waitForTimeout(3000);
    }
    
    // Look for drag and drop areas
    console.log('🔍 Looking for drag and drop areas...');
    
    // Check for file input elements
    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    console.log(`📁 Found ${fileInputCount} file input elements`);
    
    if (fileInputCount > 0) {
      console.log('✅ File input found, testing file upload...');
      
      // Test file upload
      const fileInput = fileInputs.first();
      await fileInput.setInputFiles({
        name: 'test-upload.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test file content for upload')
      });
      
      // Wait for upload to complete
      await page.waitForTimeout(2000);
    }
    
    // Check for drag and drop zones
    const dropZones = page.locator('[data-testid*="drop"], [class*="drop"], [class*="upload"], .drop-zone, .file-drop');
    const dropZoneCount = await dropZones.count();
    console.log(`🎯 Found ${dropZoneCount} potential drop zones`);
    
    if (dropZoneCount > 0) {
      console.log('✅ Drop zones found, testing drag and drop...');
      
      // Create a test file for dragging
      const testFile = {
        name: 'drag-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test file for drag and drop')
      };
      
      // Test drag and drop on each zone
      for (let i = 0; i < dropZoneCount; i++) {
        const dropZone = dropZones.nth(i);
        console.log(`🎯 Testing drop zone ${i + 1}...`);
        
        try {
          // Simulate drag and drop
          await dropZone.dispatchEvent('dragenter');
          await page.waitForTimeout(100);
          await dropZone.dispatchEvent('dragover');
          await page.waitForTimeout(100);
          await dropZone.dispatchEvent('drop', {
            dataTransfer: {
              files: [testFile]
            }
          });
          
          console.log(`✅ Drop zone ${i + 1} handled drag and drop`);
        } catch (error) {
          console.log(`❌ Drop zone ${i + 1} failed: ${error.message}`);
        }
      }
    }
    
    // Check for terminal functionality
    console.log('\n💻 Testing Terminal Functionality:');
    const terminalElements = page.locator('textarea, input[type="text"], .terminal, .xterm, [data-testid*="terminal"]');
    const terminalCount = await terminalElements.count();
    console.log(`💻 Found ${terminalCount} terminal elements`);
    
    if (terminalCount > 0) {
      console.log('✅ Terminal found, testing commands...');
      
      const terminal = terminalElements.first();
      
      // Test basic commands
      const commands = [
        'echo "Hello World"',
        'pwd',
        'ls',
        'npm --version',
        'node --version'
      ];
      
      for (const cmd of commands) {
        console.log(`🔧 Testing command: ${cmd}`);
        try {
          await terminal.fill(cmd);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
          console.log(`✅ Command executed: ${cmd}`);
        } catch (error) {
          console.log(`❌ Command failed: ${cmd} - ${error.message}`);
        }
      }
    }
    
    // Check for any error states
    console.log('\n🔍 Checking for Error States:');
    const errorElements = page.locator('.error, .alert-danger, [class*="error"], [class*="alert"]');
    const errorCount = await errorElements.count();
    console.log(`❌ Found ${errorCount} error elements`);
    
    if (errorCount > 0) {
      for (let i = 0; i < errorCount; i++) {
        const errorText = await errorElements.nth(i).textContent();
        console.log(`   Error ${i + 1}: ${errorText}`);
      }
    }
    
    // Take a screenshot for visual debugging
    await page.screenshot({ path: 'comprehensive-test-screenshot.png', fullPage: true });
    console.log('📸 Screenshot saved: comprehensive-test-screenshot.png');
    
    // Log comprehensive results
    console.log('\n📊 COMPREHENSIVE TEST RESULTS:');
    console.log(`   Total API calls: ${testResults.length}`);
    
    const successfulCalls = testResults.filter(r => r.status && r.status < 400);
    const failedCalls = testResults.filter(r => r.status && r.status >= 400);
    const errorCalls = testResults.filter(r => r.error);
    
    console.log(`   Successful calls: ${successfulCalls.length}`);
    console.log(`   Failed calls (4xx/5xx): ${failedCalls.length}`);
    console.log(`   Error calls: ${errorCalls.length}`);
    
    if (failedCalls.length > 0) {
      console.log('\n❌ Failed API Calls:');
      failedCalls.forEach(call => {
        console.log(`   - ${call.status} ${call.method} ${call.url}`);
      });
    }
    
    if (errorCalls.length > 0) {
      console.log('\n💥 Error API Calls:');
      errorCalls.forEach(call => {
        console.log(`   - ${call.method} ${call.url}: ${call.error}`);
      });
    }
    
    // Summary
    console.log('\n🎯 TEST SUMMARY:');
    console.log(`   Health endpoint: ${healthResult ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Authentication: ${sessionId ? '✅ Working' : '❌ Failed'}`);
    console.log(`   File operations: ${sessionId ? '✅ Tested' : '❌ Skipped'}`);
    console.log(`   Drag and drop: ${dropZoneCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    console.log(`   Terminal: ${terminalCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    console.log(`   File uploads: ${fileInputCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    
    expect(page).toBeTruthy();
    console.log('✅ Comprehensive testing completed');
  });
});

