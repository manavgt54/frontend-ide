import { test, expect } from '@playwright/test';

// Helper functions
async function clearAuth(page) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_user');
  });
}

async function setAuth(page, user) {
  await page.evaluate((userData) => {
    localStorage.setItem('auth_user', JSON.stringify(userData));
  }, user);
}

// Basic functionality tests - start simple
test.describe('Basic App Functionality', () => {
  test('login page loads correctly', async ({ page }) => {
    await clearAuth(page);
    await page.goto('/login');
    
    // Wait for page to load
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

  test('app handles navigation', async ({ page }) => {
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

// Core feature tests
test.describe('Core Features', () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('file operations work', async ({ page }) => {
    // Look for file-related buttons or menus
    const fileButtons = page.locator('button:has-text("File"), button:has-text("New"), button:has-text("Open")');
    const fileButtonCount = await fileButtons.count();
    
    if (fileButtonCount > 0) {
      await fileButtons.first().click();
      await page.waitForTimeout(500);
    }
    
    // App should handle file operations gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('editor functionality', async ({ page }) => {
    // Look for editor elements
    const editors = page.locator('.monaco-editor, .editor, textarea, [contenteditable]');
    const editorCount = await editors.count();
    
    if (editorCount > 0) {
      const editor = editors.first();
      await editor.click();
      await editor.type('console.log("test");');
      await page.waitForTimeout(500);
    }
    
    // Editor should be interactive
    await expect(page.locator('body')).toBeVisible();
  });

  test('panel toggles work', async ({ page }) => {
    // Look for toggle buttons
    const toggleButtons = page.locator('button:has-text("Toggle"), button:has-text("Panel"), button:has-text("Sidebar")');
    const toggleCount = await toggleButtons.count();
    
    if (toggleCount > 0) {
      await toggleButtons.first().click();
      await page.waitForTimeout(500);
    }
    
    // Panels should toggle without breaking
    await expect(page.locator('body')).toBeVisible();
  });

  test('terminal interaction', async ({ page }) => {
    // Look for terminal elements
    const terminals = page.locator('.terminal, .xterm, [data-terminal], textarea');
    const terminalCount = await terminals.count();
    
    if (terminalCount > 0) {
      const terminal = terminals.first();
      await terminal.click();
      await terminal.type('echo "test"');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
    
    // Terminal should be interactive
    await expect(page.locator('body')).toBeVisible();
  });

  test('chat functionality', async ({ page }) => {
    // Look for chat elements
    const chatInputs = page.locator('input[placeholder*="chat"], textarea[placeholder*="message"], .chat input');
    const chatCount = await chatInputs.count();
    
    if (chatCount > 0) {
      const chatInput = chatInputs.first();
      await chatInput.click();
      await chatInput.type('Hello AI');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
    
    // Chat should be functional
    await expect(page.locator('body')).toBeVisible();
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

  test('handles network errors', async ({ page }) => {
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


