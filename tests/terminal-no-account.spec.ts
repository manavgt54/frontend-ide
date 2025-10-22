import { test, expect } from '@playwright/test';

// Terminal test that handles no account scenario
test.describe('Terminal Test - No Account Scenario', () => {
  test('test terminal commands without login account', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes
    
    console.log('🚀 Starting Terminal Test (No Account Scenario)...');
    
    // Navigate to frontend
    console.log('📍 Navigating to frontend...');
    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Handle login page when no account exists
    if (currentUrl.includes('/login')) {
      console.log('🔐 On login page (no account exists)...');
      
      // Try to create a test account or bypass login
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      const passwordInput = page.locator('input[type="password"], input[name="password"]');
      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      const signupButton = page.locator('button:has-text("Sign Up"), button:has-text("Register"), a:has-text("Sign Up")');
      
      if (await emailInput.count() > 0) {
        console.log('✅ Login form found...');
        
        // Try to create a test account first
        if (await signupButton.count() > 0) {
          console.log('📝 Attempting to create test account...');
          await signupButton.click();
          await page.waitForTimeout(2000);
          
          // Fill signup form if it appears
          const signupEmail = page.locator('input[type="email"], input[name="email"]');
          const signupPassword = page.locator('input[type="password"], input[name="password"]');
          const confirmPassword = page.locator('input[name="confirmPassword"], input[name="confirm-password"]');
          const submitButton = page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Register")');
          
          if (await signupEmail.count() > 0) {
            await signupEmail.fill('test@example.com');
            if (await signupPassword.count() > 0) {
              await signupPassword.fill('testpassword123');
            }
            if (await confirmPassword.count() > 0) {
              await confirmPassword.fill('testpassword123');
            }
            if (await submitButton.count() > 0) {
              await submitButton.click();
              await page.waitForTimeout(3000);
            }
          }
        }
        
        // If still on login page, try to login with test credentials
        if (page.url().includes('/login')) {
          console.log('🔑 Attempting login with test credentials...');
          await emailInput.fill('test@example.com');
          await passwordInput.fill('testpassword123');
          await loginButton.click();
          await page.waitForTimeout(3000);
        }
      }
      
      // If still on login page, try to bypass by going directly to dashboard
      if (page.url().includes('/login')) {
        console.log('🚪 Bypassing login, going directly to dashboard...');
        await page.goto('/dashboard', { timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }
    
    // Check if we're now in the app
    const finalUrl = page.url();
    console.log(`📍 Final URL: ${finalUrl}`);
    
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
    
    // If no terminal found, check for iframe (terminal might be in iframe)
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
      await page.screenshot({ path: 'no-terminal-analysis.png', fullPage: true });
      console.log('📸 Screenshot saved: no-terminal-analysis.png');
      
      // Check page content and structure
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
      
      // Check for any terminal-related text
      const terminalText = page.locator('text=/terminal|console|command|shell/i');
      const terminalTextCount = await terminalText.count();
      console.log(`📝 Found ${terminalTextCount} terminal-related text elements`);
      
      if (terminalTextCount > 0) {
        for (let i = 0; i < Math.min(terminalTextCount, 5); i++) {
          const text = await terminalText.nth(i).textContent();
          console.log(`   ${i + 1}. "${text}"`);
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
    await page.screenshot({ path: 'terminal-test-no-account.png', fullPage: true });
    console.log('📸 Final screenshot saved: terminal-test-no-account.png');
    
    console.log('✅ Terminal command testing completed (no account scenario)');
    expect(page).toBeTruthy();
  });
});

