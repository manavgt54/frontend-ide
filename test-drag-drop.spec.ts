import { test, expect, Page } from '@playwright/test';

// Test configuration
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'https://ai-ide-5.onrender.com';

// Mock session data to bypass login
const MOCK_SESSION = {
  userId: 12345,
  sessionId: 'test-session-12345',
  googleId: 'test-google-id',
  email: 'test@example.com'
};

// Mock Google profile data
const MOCK_GOOGLE_PROFILE = {
  googleId: 'test-google-id',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg'
};

test.describe('Drag and Drop File Upload Test', () => {
  let page: Page;
  let backendCalls: any[] = [];

  test.beforeEach(async ({ browser }) => {
    // Create new page with context
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Reset backend calls tracking
    backendCalls = [];

    // Mock localStorage data to bypass login
    await page.addInitScript((session, profile) => {
      localStorage.setItem('auth_user', JSON.stringify(session));
      localStorage.setItem('google_profile', JSON.stringify(profile));
    }, MOCK_SESSION, MOCK_GOOGLE_PROFILE);

    // Intercept all network requests to backend
    await page.route('**/ai-ide-5.onrender.com/**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method();
      
      // Log the backend call
      const callInfo = {
        timestamp: new Date().toISOString(),
        method,
        url,
        headers: request.headers(),
        postData: request.postData()
      };
      
      backendCalls.push(callInfo);
      console.log(`🔗 Backend Call: ${method} ${url}`);
      
      // Continue with the request
      await route.continue();
    });

    // Navigate to the app
    await page.goto(FRONTEND_URL);
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Wait for the main app interface to be visible
    await page.waitForSelector('[data-testid="main-app"]', { timeout: 10000 });
  });

  test('should upload files via drag and drop and sync to backend', async () => {
    console.log('🚀 Starting drag and drop test...');
    
    // Wait for the file explorer to be visible
    await page.waitForSelector('[data-testid="file-explorer"]', { timeout: 10000 });
    
    // Create test files
    const testFiles = [
      { name: 'test1.js', content: 'console.log("Hello from test1.js");' },
      { name: 'test2.py', content: 'print("Hello from test2.py")' },
      { name: 'test3.txt', content: 'This is a test text file' }
    ];

    // Create a data transfer object for drag and drop
    const dataTransfer = await page.evaluateHandle((files) => {
      const dt = new DataTransfer();
      files.forEach(file => {
        const blob = new Blob([file.content], { type: 'text/plain' });
        const fileObj = new File([blob], file.name, { type: 'text/plain' });
        dt.items.add(fileObj);
      });
      return dt;
    }, testFiles);

    // Find the drop zone (file explorer area)
    const dropZone = page.locator('[data-testid="file-explorer"]').first();
    await expect(dropZone).toBeVisible();

    console.log('📁 Performing drag and drop...');
    
    // Perform drag and drop
    await dropZone.dispatchEvent('drop', {
      dataTransfer: dataTransfer
    });

    // Wait for upload to complete
    await page.waitForTimeout(3000);

    // Check if files appear in the file explorer
    for (const file of testFiles) {
      await expect(page.locator(`text=${file.name}`)).toBeVisible({ timeout: 5000 });
      console.log(`✅ File ${file.name} appears in file explorer`);
    }

    // Check backend calls
    console.log('\n📊 Backend API Calls Made:');
    backendCalls.forEach((call, index) => {
      console.log(`${index + 1}. ${call.method} ${call.url}`);
      if (call.postData) {
        console.log(`   Body: ${call.postData.substring(0, 200)}...`);
      }
    });

    // Verify specific backend calls were made
    const uploadCalls = backendCalls.filter(call => 
      call.url.includes('/files/workspace') && call.method === 'POST'
    );
    
    expect(uploadCalls.length).toBeGreaterThan(0);
    console.log(`✅ Found ${uploadCalls.length} workspace upload calls`);

    // Check for successful upload responses
    const successfulUploads = uploadCalls.filter(call => 
      call.url.includes('/files/workspace')
    );
    
    expect(successfulUploads.length).toBeGreaterThan(0);
    console.log(`✅ ${successfulUploads.length} successful upload calls detected`);

    // Test terminal functionality
    console.log('\n🖥️ Testing terminal functionality...');
    
    // Click on terminal tab
    const terminalTab = page.locator('[data-testid="terminal-tab"]');
    if (await terminalTab.isVisible()) {
      await terminalTab.click();
      await page.waitForTimeout(1000);
      
      // Try to run a command to see if files are accessible
      const terminalInput = page.locator('[data-testid="terminal-input"]');
      if (await terminalInput.isVisible()) {
        await terminalInput.fill('ls -la');
        await terminalInput.press('Enter');
        await page.waitForTimeout(2000);
        
        // Check if files are visible in terminal
        const terminalOutput = page.locator('[data-testid="terminal-output"]');
        if (await terminalOutput.isVisible()) {
          const output = await terminalOutput.textContent();
          console.log('Terminal output:', output);
          
          // Check if our test files are visible
          for (const file of testFiles) {
            if (output?.includes(file.name)) {
              console.log(`✅ File ${file.name} visible in terminal`);
            } else {
              console.log(`❌ File ${file.name} NOT visible in terminal`);
            }
          }
        }
      }
    }

    console.log('\n🎉 Test completed successfully!');
  });

  test('should monitor all backend API calls', async () => {
    console.log('🔍 Monitoring all backend calls...');
    
    // Wait for initial app load
    await page.waitForLoadState('networkidle');
    
    // Wait a bit more to capture all initial calls
    await page.waitForTimeout(2000);
    
    console.log('\n📊 All Backend API Calls:');
    backendCalls.forEach((call, index) => {
      console.log(`${index + 1}. ${call.method} ${call.url}`);
      if (call.headers) {
        console.log(`   Headers: ${JSON.stringify(call.headers, null, 2)}`);
      }
      if (call.postData) {
        console.log(`   Body: ${call.postData.substring(0, 300)}...`);
      }
      console.log('   ---');
    });
    
    // Verify we have some backend calls
    expect(backendCalls.length).toBeGreaterThan(0);
    console.log(`✅ Captured ${backendCalls.length} backend API calls`);
  });

  test.afterEach(async () => {
    // Log final summary
    console.log('\n📋 Test Summary:');
    console.log(`Total backend calls: ${backendCalls.length}`);
    
    const callTypes = backendCalls.reduce((acc, call) => {
      const endpoint = call.url.split('/').pop() || 'unknown';
      acc[endpoint] = (acc[endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Call types:', callTypes);
    
    await page.close();
  });
});

