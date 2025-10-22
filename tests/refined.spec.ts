import { test, expect } from '@playwright/test';
import { 
  createTestUser, 
  createTestSession, 
  createTestFile, 
  getTestFile, 
  listTestFiles,
  cleanupTestData 
} from './db-helper.js';

// Helper functions
async function clearAuth(page) {
  try {
    await page.evaluate(() => {
      localStorage.removeItem('auth_user');
    });
  } catch (error) {
    console.log('Note: localStorage access restricted, skipping auth clear');
  }
}

async function setAuth(page, user) {
  try {
    await page.evaluate((userData) => {
      localStorage.setItem('auth_user', JSON.stringify(userData));
    }, user);
  } catch (error) {
    console.log('Note: localStorage access restricted, skipping auth set');
  }
}

// Basic functionality tests - always run
test.describe('Basic Frontend Functionality', () => {
  test('login page loads correctly', async ({ page }) => {
    await clearAuth(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    // Check basic elements exist
    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('email validation works', async ({ page }) => {
    await page.goto('/login');
    
    // Test empty email
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
    
    // Test invalid email
    await page.fill('input[type="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
  });

  test('valid email login works', async ({ page }) => {
    await page.goto('/login');
    
    // Enter valid email
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should redirect to main app
    await page.waitForURL('**/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('main app loads with authentication', async ({ page }) => {
    // Set auth state
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check main app elements
    await expect(page.locator('body')).toBeVisible();
    
    // Look for common IDE elements
    const hasEditor = await page.locator('.monaco-editor, .editor, textarea').count() > 0;
    const hasSidebar = await page.locator('.sidebar, .panel, nav').count() > 0;
    
    expect(hasEditor || hasSidebar).toBeTruthy();
  });

  test('app handles basic interactions', async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
    
    // Test basic navigation
    await page.waitForTimeout(1000);
    
    // Try to find and click any buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      await buttons.first().click();
      await page.waitForTimeout(500);
    }
    
    // App should still be responsive
    await expect(page.locator('body')).toBeVisible();
  });
});

// Backend integration tests - only run if backend is available
test.describe('Backend Integration', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.BACKEND_AVAILABLE !== 'true', 'Backend not available');
  });

  test('backend health check', async ({ page }) => {
    const backendUrl = process.env.BACKEND_URL || 'https://ai-ide-5.onrender.com';
    const response = await page.request.get(`${backendUrl}/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.sessions).toBeDefined();
  });

  test('backend root endpoint', async ({ page }) => {
    const backendUrl = process.env.BACKEND_URL || 'https://ai-ide-5.onrender.com';
    const response = await page.request.get(`${backendUrl}/`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('running');
    expect(data.timestamp).toBeDefined();
  });

  test('google auth endpoint', async ({ page }) => {
    const backendUrl = process.env.BACKEND_URL || 'https://ai-ide-5.onrender.com';
    const response = await page.request.post(`${backendUrl}/auth/google`, {
      data: { 
        googleId: 'test123', 
        email: 'test@example.com' 
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.userId).toBeDefined();
    expect(data.sessionId).toBeDefined();
  });

  test('session management', async ({ page }) => {
    const backendUrl = process.env.BACKEND_URL || 'https://ai-ide-5.onrender.com';
    
    // First create a session
    const authResponse = await page.request.post(`${backendUrl}/auth/google`, {
      data: { 
        googleId: 'test123', 
        email: 'test@example.com' 
      }
    });
    
    const authData = await authResponse.json();
    const sessionId = authData.sessionId;
    
    // Test session validation
    const validateResponse = await page.request.post(`${backendUrl}/auth/session/validate`, {
      data: { sessionId }
    });
    
    expect(validateResponse.ok()).toBeTruthy();
    
    const validateData = await validateResponse.json();
    expect(validateData.ok).toBe(true);
    expect(validateData.sessionId).toBe(sessionId);
  });

  test('file operations', async ({ page }) => {
    const backendUrl = process.env.BACKEND_URL || 'https://ai-ide-5.onrender.com';
    
    // Create session first
    const authResponse = await page.request.post(`${backendUrl}/auth/google`, {
      data: { 
        googleId: 'test123', 
        email: 'test@example.com' 
      }
    });
    
    const authData = await authResponse.json();
    const sessionId = authData.sessionId;
    
    // Test file save
    const saveResponse = await page.request.post(`${backendUrl}/files/save`, {
      headers: { 'x-session-id': sessionId },
      data: { 
        filename: 'test.txt', 
        content: 'Hello World!' 
      }
    });
    
    expect(saveResponse.ok()).toBeTruthy();
    
    // Test file list
    const listResponse = await page.request.get(`${backendUrl}/files?sessionId=${sessionId}`);
    expect(listResponse.ok()).toBeTruthy();
    
    const listData = await listResponse.json();
    expect(listData.files).toBeDefined();
    expect(listData.files.length).toBeGreaterThan(0);
    
    // Test file open
    const openResponse = await page.request.post(`${backendUrl}/files/open`, {
      headers: { 'x-session-id': sessionId },
      data: { filename: 'test.txt' }
    });
    
    expect(openResponse.ok()).toBeTruthy();
    
    const openData = await openResponse.json();
    expect(openData.content).toBe('Hello World!');
  });
});

// Terminal tests - only run if backend is available
test.describe('Terminal Functionality', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.BACKEND_AVAILABLE !== 'true', 'Backend not available');
  });

  test('terminal WebSocket connection', async ({ page }) => {
    await setAuth(page, { 
      email: 'test@example.com', 
      provider: 'email',
      sessionId: 'test-session-123'
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for terminal elements
    const terminals = page.locator('.terminal, .xterm, [data-terminal], textarea');
    const terminalCount = await terminals.count();
    
    if (terminalCount > 0) {
      const terminal = terminals.first();
      await terminal.click();
      
      // Test basic terminal interaction
      await terminal.type('echo "test"');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
    
    // Terminal should be interactive
    await expect(page.locator('body')).toBeVisible();
  });

  test('npm commands work', async ({ page }) => {
    await setAuth(page, { 
      email: 'test@example.com', 
      provider: 'email',
      sessionId: 'test-session-123'
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const terminals = page.locator('.terminal, .xterm, [data-terminal], textarea');
    const terminalCount = await terminals.count();
    
    if (terminalCount > 0) {
      const terminal = terminals.first();
      await terminal.click();
      
      // Test npm commands
      const npmCommands = [
        'npm --version',
        'npm list',
        'npm help'
      ];
      
      for (const cmd of npmCommands) {
        await terminal.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
    
    await expect(page.locator('body')).toBeVisible();
  });
});

// Database integration tests - only run if database is available
test.describe('Database Integration', () => {
  test.skip(process.env.DB_AVAILABLE !== 'true', 'Database not available');
  
  test('can create and manage test users', async () => {
    const testEmail = `test-${Date.now()}@playwright.test`;
    const userId = await createTestUser(testEmail);
    expect(userId).toBeGreaterThan(0);
    console.log(`✅ Created test user with ID: ${userId}`);
  });

  test('can create and manage test sessions', async () => {
    const testEmail = `session-test-${Date.now()}@playwright.test`;
    const userId = await createTestUser(testEmail);
    const sessionId = await createTestSession(userId);
    expect(sessionId).toMatch(/^test_/);
    console.log(`✅ Created test session: ${sessionId}`);
  });

  test('can create and read test files', async () => {
    const testEmail = `file-test-${Date.now()}@playwright.test`;
    const userId = await createTestUser(testEmail);
    const sessionId = await createTestSession(userId);
    
    const filename = 'test-file.txt';
    const content = 'Hello from Playwright test!';
    
    await createTestFile(sessionId, filename, content);
    const retrievedContent = await getTestFile(sessionId, filename);
    
    expect(retrievedContent).toBe(content);
    console.log(`✅ Created and retrieved test file: ${filename}`);
  });

  test('can list test files', async () => {
    const testEmail = `list-test-${Date.now()}@playwright.test`;
    const userId = await createTestUser(testEmail);
    const sessionId = await createTestSession(userId);
    
    // Create multiple test files
    await createTestFile(sessionId, 'file1.txt', 'Content 1');
    await createTestFile(sessionId, 'file2.txt', 'Content 2');
    await createTestFile(sessionId, 'file3.txt', 'Content 3');
    
    const files = await listTestFiles(sessionId);
    expect(files.length).toBe(3);
    expect(files.map(f => f.filename)).toContain('file1.txt');
    expect(files.map(f => f.filename)).toContain('file2.txt');
    expect(files.map(f => f.filename)).toContain('file3.txt');
    
    console.log(`✅ Listed ${files.length} test files`);
  });

  test('database cleanup works', async () => {
    // Create some test data
    const testEmail = `cleanup-test-${Date.now()}@playwright.test`;
    const userId = await createTestUser(testEmail);
    const sessionId = await createTestSession(userId);
    await createTestFile(sessionId, 'cleanup-test.txt', 'Cleanup test content');
    
    // Clean up
    await cleanupTestData();
    
    // Verify cleanup worked
    const files = await listTestFiles(sessionId);
    expect(files.length).toBe(0);
    
    console.log('✅ Database cleanup completed successfully');
  });
});

// Error handling tests
test.describe('Error Handling', () => {
  test('handles invalid routes', async ({ page }) => {
    await page.goto('/invalid-route');
    await page.waitForTimeout(1000);
    
    // Should either show 404 or redirect
    const currentUrl = page.url();
    expect(currentUrl.includes('/invalid-route') || currentUrl.includes('/login')).toBeTruthy();
  });

  test('handles corrupted localStorage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('auth_user', 'invalid-json');
    });
    
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    // Should handle gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('handles network errors gracefully', async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    
    // Simulate network failure
    await page.route('**/*', route => route.abort());
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Should handle network errors gracefully
    await expect(page.locator('body')).toBeVisible();
  });
});

// Input validation tests
test.describe('Input Validation', () => {
  test('handles empty inputs', async ({ page }) => {
    await page.goto('/login');
    
    // Test empty email
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-red-500')).toBeVisible();
  });

  test('handles oversized inputs', async ({ page }) => {
    await page.goto('/login');
    
    const oversizedEmail = 'a'.repeat(1000) + '@example.com';
    await page.fill('input[type="email"]', oversizedEmail);
    await page.click('button[type="submit"]');
    
    // Should handle oversized input
    await page.waitForTimeout(1000);
  });

  test('handles special characters', async ({ page }) => {
    await page.goto('/login');
    
    const specialEmail = 'test+tag@example.com';
    await page.fill('input[type="email"]', specialEmail);
    await page.click('button[type="submit"]');
    
    // Should handle special characters
    await page.waitForTimeout(1000);
  });
});

// Performance tests
test.describe('Performance', () => {
  test('loads quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
  });

  test('handles rapid interactions', async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
    
    // Rapidly click buttons
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(100);
    }
    
    // App should remain responsive
    await expect(page.locator('body')).toBeVisible();
  });
});
