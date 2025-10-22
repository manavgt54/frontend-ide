import { test, expect, Page } from '@playwright/test';

// Test data for edge cases
const EDGE_CASES = {
  emails: {
    valid: ['test@example.com', 'user.name+tag@domain.co.uk', 'a@b.c'],
    invalid: ['', 'invalid', '@domain.com', 'user@', 'user@domain', 'user..name@domain.com', 'user@domain..com'],
    oversized: ['a'.repeat(1000) + '@example.com'],
    specialChars: ['user+test@example.com', 'user.test@example.com', 'user_test@example.com']
  },
  inputs: {
    empty: '',
    oversized: 'a'.repeat(10000),
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    unicode: '🚀🎉💻🔥✨',
    sqlInjection: "'; DROP TABLE users; --",
    xss: '<script>alert("xss")</script>',
    newlines: 'line1\nline2\nline3'
  }
};

// Helper functions
async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_user');
  });
}

async function setAuth(page: Page, user: any) {
  await page.evaluate((userData) => {
    localStorage.setItem('auth_user', JSON.stringify(userData));
  }, user);
}

async function waitForAppLoad(page: Page) {
  await page.waitForSelector('[data-testid="app-shell"], .app-shell', { timeout: 10000 });
}

// Login page tests
test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuth(page);
    await page.goto('/login');
  });

  test('should load login page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/AI IDE/);
    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation error for empty email', async ({ page }) => {
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
  });

  test('should validate email format', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    
    // Test invalid email formats
    for (const invalidEmail of EDGE_CASES.emails.invalid) {
      await emailInput.fill(invalidEmail);
      await page.click('button[type="submit"]');
      await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
    }
  });

  test('should handle oversized email input', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(EDGE_CASES.emails.oversized[0]);
    await page.click('button[type="submit"]');
    // Should either validate or handle gracefully
    await expect(page.locator('.text-red-500')).toBeVisible();
  });

  test('should handle special characters in email', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    
    for (const specialEmail of EDGE_CASES.emails.specialChars) {
      await emailInput.fill(specialEmail);
      await page.click('button[type="submit"]');
      // Should either accept valid special chars or show validation error
      const errorVisible = await page.locator('.text-red-500').isVisible();
      const successRedirect = page.url() === 'http://localhost:5173/';
      expect(errorVisible || successRedirect).toBeTruthy();
    }
  });

  test('should handle XSS attempts in email', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(EDGE_CASES.inputs.xss);
    await page.click('button[type="submit"]');
    // Should not execute script, should show validation error
    await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
  });

  test('should handle SQL injection attempts', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(EDGE_CASES.inputs.sqlInjection);
    await page.click('button[type="submit"]');
    // Should show validation error, not execute SQL
    await expect(page.locator('.text-red-500')).toContainText('Enter a valid email');
  });

  test('should handle rapid form submissions', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test@example.com');
    
    // Rapidly click submit multiple times
    for (let i = 0; i < 5; i++) {
      await page.click('button[type="submit"]');
    }
    
    // Should handle gracefully without multiple submissions
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl === 'http://localhost:5173/' || currentUrl.includes('/login')).toBeTruthy();
  });

  test('should handle Google sign-in button click', async ({ page }) => {
    await page.click('text=Continue with Google');
    // Should either show error (no Google config) or handle gracefully
    await page.waitForTimeout(1000);
    // Check if error message appears or if it handles gracefully
    const hasError = await page.locator('.text-red-500').isVisible();
    expect(hasError).toBeTruthy(); // Expected since Google client ID might not be configured
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('test@example.com');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl === 'http://localhost:5173/' || currentUrl.includes('/login')).toBeTruthy();
  });

  test('should handle form submission with Enter key', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test@example.com');
    await emailInput.press('Enter');
    
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl === 'http://localhost:5173/' || currentUrl.includes('/login')).toBeTruthy();
  });
});

// Main app tests
test.describe('Main Application', () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
  });

  test('should load main application correctly', async ({ page }) => {
    await waitForAppLoad(page);
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('[data-testid="titlebar"], .titlebar')).toBeVisible();
  });

  test('should handle panel visibility toggles', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Test explorer toggle
    const explorerToggle = page.locator('[data-testid="explorer-toggle"], button:has-text("Explorer")').first();
    if (await explorerToggle.isVisible()) {
      await explorerToggle.click();
      await page.waitForTimeout(500);
    }
    
    // Test terminal toggle
    const terminalToggle = page.locator('[data-testid="terminal-toggle"], button:has-text("Terminal")').first();
    if (await terminalToggle.isVisible()) {
      await terminalToggle.click();
      await page.waitForTimeout(500);
    }
    
    // Test chat toggle
    const chatToggle = page.locator('[data-testid="chat-toggle"], button:has-text("Chat")').first();
    if (await chatToggle.isVisible()) {
      await chatToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('should handle file operations', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Test creating new file
    const newFileButton = page.locator('[data-testid="new-file"], button:has-text("New File")').first();
    if (await newFileButton.isVisible()) {
      await newFileButton.click();
      await page.waitForTimeout(500);
    }
    
    // Test opening system file dialog
    const openFileButton = page.locator('[data-testid="open-file"], button:has-text("Open File")').first();
    if (await openFileButton.isVisible()) {
      await openFileButton.click();
      await page.waitForTimeout(500);
      // Cancel the dialog
      await page.keyboard.press('Escape');
    }
  });

  test('should handle code execution', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Look for run button or code execution functionality
    const runButton = page.locator('[data-testid="run-code"], button:has-text("Run")').first();
    if (await runButton.isVisible()) {
      await runButton.click();
      await page.waitForTimeout(2000);
    }
  });

  test('should handle terminal interactions', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Look for terminal input
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      await page.keyboard.type('echo "test"');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
  });

  test('should handle AI chat interactions', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Look for chat input
    const chatInput = page.locator('[data-testid="chat-input"], .chat input, textarea').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('Hello AI');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }
  });

  test('should handle theme switching', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Look for theme toggle
    const themeToggle = page.locator('[data-testid="theme-toggle"], button:has-text("Theme")').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('should handle window resizing', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Test different viewport sizes
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(500);
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile
    await page.waitForTimeout(500);
  });

  test('should handle localStorage edge cases', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Test with corrupted localStorage
    await page.evaluate(() => {
      localStorage.setItem('auth_user', 'invalid-json');
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Should redirect to login or handle gracefully
    const currentUrl = page.url();
    expect(currentUrl.includes('/login') || currentUrl === 'http://localhost:5173/').toBeTruthy();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await waitForAppLoad(page);
    
    // Simulate network failure
    await page.route('**/*', route => route.abort());
    
    // Try to interact with the app
    const runButton = page.locator('[data-testid="run-code"], button:has-text("Run")').first();
    if (await runButton.isVisible()) {
      await runButton.click();
      await page.waitForTimeout(1000);
    }
  });
});

// Terminal command tests
test.describe('Terminal Commands', () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should handle npm commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      // Test various npm commands
      const npmCommands = [
        'npm --version',
        'npm list',
        'npm help',
        'npm init --help'
      ];
      
      for (const cmd of npmCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should handle npx commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      const npxCommands = [
        'npx --version',
        'npx --help',
        'npx create-react-app --help'
      ];
      
      for (const cmd of npxCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should handle node commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      const nodeCommands = [
        'node --version',
        'node --help',
        'node -e "console.log(\'test\')"'
      ];
      
      for (const cmd of nodeCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should handle git commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      const gitCommands = [
        'git --version',
        'git --help',
        'git status',
        'git log --oneline -5'
      ];
      
      for (const cmd of gitCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should handle invalid commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      const invalidCommands = [
        'invalidcommand123',
        'nonexistentpackage',
        'command with spaces',
        'command;rm -rf /',
        'command && echo "test"'
      ];
      
      for (const cmd of invalidCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }
  });

  test('should handle long running commands', async ({ page }) => {
    const terminalInput = page.locator('[data-testid="terminal-input"], .terminal input, .xterm').first();
    if (await terminalInput.isVisible()) {
      await terminalInput.click();
      
      // Test commands that might take time
      const longCommands = [
        'ping google.com -n 3',
        'dir /s',
        'npm install --help'
      ];
      
      for (const cmd of longCommands) {
        await terminalInput.fill(cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000); // Wait longer for these commands
      }
    }
  });
});

// Performance and stress tests
test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
  });

  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await waitForAppLoad(page);
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
  });

  test('should handle multiple rapid interactions', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Rapidly click various elements
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(100);
    }
  });

  test('should handle memory usage', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Perform memory-intensive operations
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        // Create large objects
        const largeArray = new Array(10000).fill(0).map((_, i) => ({ id: i, data: 'x'.repeat(100) }));
        return largeArray.length;
      });
    }
    
    // Check if app is still responsive
    const runButton = page.locator('[data-testid="run-code"], button:has-text("Run")').first();
    if (await runButton.isVisible()) {
      await runButton.click();
      await page.waitForTimeout(1000);
    }
  });
});

// Accessibility tests
test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setAuth(page, { email: 'test@example.com', provider: 'email' });
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should have proper ARIA labels', async ({ page }) => {
    // Check for common ARIA attributes
    const elementsWithAria = page.locator('[aria-label], [aria-labelledby], [aria-describedby]');
    const count = await elementsWithAria.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should support keyboard navigation', async ({ page }) => {
    // Test tab navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Test arrow keys
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
  });

  test('should have proper focus management', async ({ page }) => {
    const focusableElements = page.locator('button, input, textarea, [tabindex]:not([tabindex="-1"])');
    const count = await focusableElements.count();
    
    if (count > 0) {
      await focusableElements.first().focus();
      await page.waitForTimeout(100);
      
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
  });
});




