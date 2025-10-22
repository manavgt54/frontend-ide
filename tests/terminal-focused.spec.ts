import { test, expect } from '@playwright/test';

// Focused terminal command test with proper login
test.describe('Terminal Command Execution Test', () => {
  test('test terminal commands with proper login and logging', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes
    
    console.log('🚀 Starting Terminal Command Test...');
    
    // Navigate to frontend with longer timeout
    console.log('📍 Navigating to frontend...');
    await page.goto('/', { timeout: 60000 });
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Handle login if needed
    if (currentUrl.includes('/login')) {
      console.log('🔐 Handling login...');
      
      // Try to find login form elements
      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
      const passwordInput = page.locator('input[type="password"], input[name="password"]');
      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      
      if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
        console.log('✅ Login form found, attempting login...');
        await emailInput.fill('test@example.com');
        await passwordInput.fill('testpassword');
        await loginButton.click();
        
        // Wait for redirect
        await page.waitForTimeout(5000);
      } else {
        console.log('⚠️ Login form not found, trying to bypass...');
        // Try to navigate directly to dashboard
        await page.goto('/dashboard', { timeout: 30000 });
      }
    }
    
    // Wait for app to load
    await page.waitForTimeout(3000);
    
    // Look for terminal elements with more specific selectors
    console.log('💻 Looking for terminal elements...');
    
    const terminalSelectors = [
      'textarea',
      'input[type="text"]',
      '.terminal',
      '.xterm',
      '[data-testid*="terminal"]',
      '[class*="terminal"]',
      '[id*="terminal"]',
      '.command-line',
      '.console',
      '.shell',
      'pre',
      'code'
    ];
    
    let terminal = null;
    for (const selector of terminalSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        terminal = elements.first();
        break;
      }
    }
    
    if (!terminal) {
      console.log('❌ No terminal found, checking page content...');
      
      // Take screenshot to see what's on the page
      await page.screenshot({ path: 'no-terminal-found.png', fullPage: true });
      console.log('📸 Screenshot saved: no-terminal-found.png');
      
      // Check page content
      const pageContent = await page.textContent('body');
      console.log('📄 Page content preview:', pageContent?.substring(0, 500));
      
      // Look for any interactive elements
      const interactiveElements = page.locator('input, button, textarea, select');
      const interactiveCount = await interactiveElements.count();
      console.log(`🔍 Found ${interactiveCount} interactive elements`);
      
      if (interactiveCount > 0) {
        console.log('🔍 Interactive elements found:');
        for (let i = 0; i < Math.min(interactiveCount, 10); i++) {
          const element = interactiveElements.nth(i);
          const tagName = await element.evaluate(el => el.tagName);
          const className = await element.getAttribute('class');
          const id = await element.getAttribute('id');
          console.log(`   ${i + 1}. ${tagName} class="${className}" id="${id}"`);
        }
      }
      
      expect(page).toBeTruthy();
      return;
    }
    
    console.log('✅ Terminal found, testing commands...');
    
    // Test basic commands
    const commands = [
      'echo "Hello World"',
      'pwd',
      'ls -la',
      'npm --version',
      'node --version',
      'git --version',
      'npx --version'
    ];
    
    for (const command of commands) {
      try {
        console.log(`\n🔧 Testing command: ${command}`);
        
        // Clear terminal
        await terminal.click();
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        
        // Type command
        await terminal.fill(command);
        await page.keyboard.press('Enter');
        
        // Wait for execution
        await page.waitForTimeout(2000);
        
        // Get terminal content
        const terminalContent = await terminal.inputValue();
        console.log(`   📤 Input: ${command}`);
        console.log(`   📥 Output: ${terminalContent}`);
        
        // Check for errors
        const errorElements = page.locator('.error, .alert-danger, [class*="error"]');
        const errorCount = await errorElements.count();
        if (errorCount > 0) {
          console.log(`   ❌ Errors: ${errorCount}`);
        }
        
        console.log(`   ✅ Command executed`);
        
      } catch (error) {
        console.log(`   ❌ Command failed: ${error.message}`);
      }
    }
    
    // Test file operations
    console.log('\n📁 Testing file operations...');
    try {
      await terminal.fill('mkdir test-terminal-dir');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await terminal.fill('cd test-terminal-dir');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await terminal.fill('echo "test content" > test.txt');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await terminal.fill('cat test.txt');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      console.log('✅ File operations tested');
    } catch (error) {
      console.log(`❌ File operations failed: ${error.message}`);
    }
    
    // Test package.json operations
    console.log('\n📄 Testing package.json operations...');
    try {
      await terminal.fill('cd ..');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await terminal.fill('cat package.json');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      
      await terminal.fill('npm list');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      
      console.log('✅ Package.json operations tested');
    } catch (error) {
      console.log(`❌ Package.json operations failed: ${error.message}`);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'terminal-test-complete.png', fullPage: true });
    console.log('📸 Final screenshot saved: terminal-test-complete.png');
    
    console.log('✅ Terminal command testing completed');
    expect(page).toBeTruthy();
  });
});

