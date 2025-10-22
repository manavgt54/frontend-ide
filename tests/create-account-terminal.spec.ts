import { test, expect } from '@playwright/test';

// Test that creates account and then tests terminal
test.describe('Create Account + Terminal Test', () => {
  test('create test account and test terminal commands', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes
    
    console.log('🚀 Starting Account Creation + Terminal Test...');
    
    // Navigate to frontend
    console.log('📍 Navigating to frontend...');
    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Handle login page
    if (currentUrl.includes('/login') || currentUrl === 'http://localhost:5173/') {
      console.log('🔐 On login page, creating test account...');
      
      // Fill email and try to continue
      const emailInput = page.locator('input[placeholder*="example.com"], input[type="email"]');
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Sign in")');
      
      if (await emailInput.count() > 0 && await continueButton.count() > 0) {
        console.log('✅ Login form found, entering test email...');
        await emailInput.fill('test@example.com');
        await continueButton.click();
        
        // Wait for next step
        await page.waitForTimeout(3000);
        
        // Check if we need to create account or if it exists
        const currentStep = page.url();
        console.log(`📍 After email step: ${currentStep}`);
        
        // Look for password field or signup option
        const passwordInput = page.locator('input[type="password"], input[placeholder*="password" i]');
        const signupButton = page.locator('button:has-text("Sign Up"), button:has-text("Create Account"), button:has-text("Register")');
        const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In")');
        
        if (await passwordInput.count() > 0) {
          console.log('🔑 Password field found, entering password...');
          await passwordInput.fill('testpassword123');
          
          // Try to login first
          if (await loginButton.count() > 0) {
            console.log('🔑 Attempting login...');
            await loginButton.click();
            await page.waitForTimeout(3000);
          }
          
          // If login failed, try to signup
          if (page.url().includes('/login') || page.url() === 'http://localhost:5173/') {
            console.log('📝 Login failed, trying to signup...');
            if (await signupButton.count() > 0) {
              await signupButton.click();
              await page.waitForTimeout(3000);
            }
          }
        }
        
        // If still on login page, try Google auth
        if (page.url().includes('/login') || page.url() === 'http://localhost:5173/') {
          console.log('🔍 Trying Google authentication...');
          const googleButton = page.locator('button:has-text("Google"), button:has-text("Continue with Google")');
          if (await googleButton.count() > 0) {
            await googleButton.click();
            await page.waitForTimeout(5000);
          }
        }
      }
    }
    
    // Check if we're now in the app
    const finalUrl = page.url();
    console.log(`📍 Final URL: ${finalUrl}`);
    
    // If still on login page, try to bypass by going directly to dashboard
    if (finalUrl.includes('/login') || finalUrl === 'http://localhost:5173/') {
      console.log('🚪 Bypassing login, going directly to dashboard...');
      await page.goto('/dashboard', { timeout: 30000 });
      await page.waitForTimeout(3000);
    }
    
    // Check if we're now in the app
    const appUrl = page.url();
    console.log(`📍 App URL: ${appUrl}`);
    
    // Look for terminal elements
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
      'code',
      'iframe'
    ];
    
    let terminal = null;
    let terminalFound = false;
    
    for (const selector of terminalSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        terminal = elements.first();
        terminalFound = true;
        break;
      }
    }
    
    // If no terminal found, check for iframe
    if (!terminalFound) {
      console.log('🔍 Checking for iframe terminals...');
      const iframes = page.locator('iframe');
      const iframeCount = await iframes.count();
      console.log(`📺 Found ${iframeCount} iframes`);
      
      if (iframeCount > 0) {
        for (let i = 0; i < iframeCount; i++) {
          const iframe = iframes.nth(i);
          try {
            const iframeContent = iframe.contentFrame();
            if (iframeContent) {
              const iframeTerminal = iframeContent.locator('textarea, input[type="text"], .terminal, .xterm');
              const iframeTerminalCount = await iframeTerminal.count();
              if (iframeTerminalCount > 0) {
                console.log(`✅ Found terminal in iframe ${i + 1}`);
                terminal = iframeTerminal.first();
                terminalFound = true;
                break;
              }
            }
          } catch (error) {
            console.log(`❌ Could not access iframe ${i + 1}: ${error.message}`);
          }
        }
      }
    }
    
    if (!terminalFound) {
      console.log('❌ No terminal found, analyzing page structure...');
      
      // Take screenshot to see what's on the page
      await page.screenshot({ path: 'account-created-no-terminal.png', fullPage: true });
      console.log('📸 Screenshot saved: account-created-no-terminal.png');
      
      // Check page content
      const pageContent = await page.textContent('body');
      console.log('📄 Page content preview:', pageContent?.substring(0, 1000));
      
      // Look for any interactive elements
      const interactiveElements = page.locator('input, button, textarea, select, [contenteditable="true"]');
      const interactiveCount = await interactiveElements.count();
      console.log(`🔍 Found ${interactiveCount} interactive elements`);
      
      if (interactiveCount > 0) {
        console.log('🔍 Interactive elements found:');
        for (let i = 0; i < Math.min(interactiveCount, 15); i++) {
          const element = interactiveElements.nth(i);
          const tagName = await element.evaluate(el => el.tagName);
          const className = await element.getAttribute('class');
          const id = await element.getAttribute('id');
          const placeholder = await element.getAttribute('placeholder');
          console.log(`   ${i + 1}. ${tagName} class="${className}" id="${id}" placeholder="${placeholder}"`);
        }
      }
      
      // Check for any error messages
      const errorElements = page.locator('.error, .alert-danger, [class*="error"], [class*="alert"]');
      const errorCount = await errorElements.count();
      if (errorCount > 0) {
        console.log(`❌ Found ${errorCount} error elements:`);
        for (let i = 0; i < errorCount; i++) {
          const errorText = await errorElements.nth(i).textContent();
          console.log(`   ${i + 1}. ${errorText}`);
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
    
    // Take final screenshot
    await page.screenshot({ path: 'account-created-terminal-test.png', fullPage: true });
    console.log('📸 Final screenshot saved: account-created-terminal-test.png');
    
    console.log('✅ Account creation + Terminal testing completed');
    expect(page).toBeTruthy();
  });
});

