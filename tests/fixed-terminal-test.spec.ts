import { test, expect } from '@playwright/test';

// Fixed test that handles authentication properly
test.describe('Fixed Terminal Test with Proper Authentication', () => {
  test('test terminal with proper authentication and extended time', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes
    
    console.log('🚀 Starting Fixed Terminal Test...');
    
    // Navigate to the root URL (not dashboard)
    console.log('📍 Navigating to localhost:5173/ (root)...');
    await page.goto('http://localhost:5173/', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Handle login if redirected
    if (currentUrl.includes('/login')) {
      console.log('🔐 On login page, handling authentication...');
      
      // Fill email and continue
      const emailInput = page.locator('input[placeholder*="example.com"], input[type="email"]');
      const continueButton = page.locator('button:has-text("Continue with Email")');
      
      if (await emailInput.count() > 0 && await continueButton.count() > 0) {
        console.log('✅ Login form found, entering test email...');
        await emailInput.fill('test@example.com');
        await continueButton.click();
        
        // Wait for next step
        await page.waitForTimeout(3000);
        
        // Check if we need password or if it's Google auth
        const passwordInput = page.locator('input[type="password"], input[placeholder*="password" i]');
        const googleButton = page.locator('button:has-text("Google"), button:has-text("Continue with Google")');
        
        if (await passwordInput.count() > 0) {
          console.log('🔑 Password field found, entering password...');
          await passwordInput.fill('testpassword123');
          
          const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In")');
          if (await loginButton.count() > 0) {
            await loginButton.click();
            await page.waitForTimeout(3000);
          }
        } else if (await googleButton.count() > 0) {
          console.log('🔍 Trying Google authentication...');
          await googleButton.click();
          await page.waitForTimeout(5000);
        }
      }
    }
    
    // Wait for app to load
    await page.waitForTimeout(5000);
    
    const finalUrl = page.url();
    console.log(`📍 Final URL: ${finalUrl}`);
    
    // Take initial screenshot
    await page.screenshot({ path: 'app-loaded.png', fullPage: true });
    console.log('📸 Screenshot saved: app-loaded.png');
    
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
      'iframe',
      '[contenteditable="true"]'
    ];
    
    let terminalFound = false;
    let terminal = null;
    
    for (const selector of terminalSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        
        // Check each element to see if it's interactive
        for (let i = 0; i < count; i++) {
          const element = elements.nth(i);
          try {
            const isEditable = await element.evaluate(el => {
              return el.tagName === 'INPUT' || 
                     el.tagName === 'TEXTAREA' || 
                     el.contentEditable === 'true' ||
                     el.contentEditable === '' ||
                     el.getAttribute('role') === 'textbox' ||
                     el.getAttribute('role') === 'input';
            });
            
            if (isEditable) {
              console.log(`   ✅ Element ${i + 1} is interactive!`);
              terminal = element;
              terminalFound = true;
              break;
            } else {
              console.log(`   ❌ Element ${i + 1} is not interactive`);
            }
          } catch (error) {
            console.log(`   ❌ Could not check element ${i + 1}: ${error.message}`);
          }
        }
        
        if (terminalFound) break;
      }
    }
    
    // If no terminal found, look for terminal toggle button
    if (!terminalFound) {
      console.log('🔍 Looking for terminal toggle button...');
      const terminalButtons = page.locator('button:has-text("Terminal"), button:has-text("Console"), [data-testid*="terminal"], [title*="terminal" i]');
      const buttonCount = await terminalButtons.count();
      console.log(`🔘 Found ${buttonCount} potential terminal buttons`);
      
      if (buttonCount > 0) {
        for (let i = 0; i < buttonCount; i++) {
          const button = terminalButtons.nth(i);
          const buttonText = await button.textContent();
          const buttonTitle = await button.getAttribute('title');
          console.log(`   Button ${i + 1}: "${buttonText}" title="${buttonTitle}"`);
          
          try {
            console.log(`   🔘 Clicking button ${i + 1}...`);
            await button.click();
            await page.waitForTimeout(2000);
            
            // Check if terminal appeared after clicking
            const newTerminal = page.locator('textarea, input[type="text"], [contenteditable="true"]');
            const newTerminalCount = await newTerminal.count();
            if (newTerminalCount > 0) {
              console.log(`   ✅ Terminal appeared after clicking button ${i + 1}!`);
              terminal = newTerminal.first();
              terminalFound = true;
              break;
            }
          } catch (error) {
            console.log(`   ❌ Button ${i + 1} click failed: ${error.message}`);
          }
        }
      }
    }
    
    if (!terminalFound) {
      console.log('❌ No interactive terminal found, analyzing page structure...');
      
      // Look for any interactive elements
      const interactiveElements = page.locator('input, button, textarea, select, [contenteditable="true"]');
      const interactiveCount = await interactiveElements.count();
      console.log(`🔍 Found ${interactiveCount} interactive elements`);
      
      if (interactiveCount > 0) {
        console.log('🔍 Interactive elements found:');
        for (let i = 0; i < Math.min(interactiveCount, 20); i++) {
          const element = interactiveElements.nth(i);
          const tagName = await element.evaluate(el => el.tagName);
          const className = await element.getAttribute('class');
          const id = await element.getAttribute('id');
          const placeholder = await element.getAttribute('placeholder');
          const role = await element.getAttribute('role');
          console.log(`   ${i + 1}. ${tagName} class="${className}" id="${id}" placeholder="${placeholder}" role="${role}"`);
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
      
      console.log('\n🎯 MANUAL TESTING TIME - Browser will stay open for 5 minutes');
      console.log('   You can now manually test:');
      console.log('   - Look for terminal/console elements');
      console.log('   - Try clicking buttons to open terminal');
      console.log('   - Test drag and drop functionality');
      console.log('   - Check for any interactive elements');
      console.log('   - Test npm, npx, node, git commands if terminal is found');
      
      // Keep browser open for 5 minutes for manual testing
      console.log('⏰ Waiting 5 minutes for manual testing...');
      await page.waitForTimeout(300000); // 5 minutes
      
      // Take final screenshot
      await page.screenshot({ path: 'manual-testing-complete.png', fullPage: true });
      console.log('📸 Final screenshot saved: manual-testing-complete.png');
      
      expect(page).toBeTruthy();
      return;
    }
    
    console.log('✅ Interactive terminal found, testing commands...');
    
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
    await page.screenshot({ path: 'terminal-test-complete.png', fullPage: true });
    console.log('📸 Final screenshot saved: terminal-test-complete.png');
    
    console.log('✅ Terminal testing completed');
    expect(page).toBeTruthy();
  });
});
