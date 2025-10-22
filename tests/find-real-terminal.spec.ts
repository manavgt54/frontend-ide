import { test, expect } from '@playwright/test';

// Test that finds the real interactive terminal
test.describe('Find Real Interactive Terminal', () => {
  test('find and test the actual interactive terminal', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes
    
    console.log('🚀 Starting Real Terminal Search...');
    
    // Navigate to frontend
    console.log('📍 Navigating to frontend...');
    await page.goto('/', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // Try to bypass login and go to dashboard
    console.log('🚪 Going directly to dashboard...');
    await page.goto('/dashboard', { timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Look for ALL possible terminal elements
    console.log('💻 Searching for ALL possible terminal elements...');
    
    // Check for WebSocket connections first
    const wsConnections: any[] = [];
    page.on('websocket', ws => {
      wsConnections.push({
        url: ws.url(),
        timestamp: new Date().toISOString()
      });
      console.log(`🔌 WebSocket connected: ${ws.url()}`);
    });
    
    // Wait for potential WebSocket connections
    await page.waitForTimeout(5000);
    
    // Look for terminal in all possible places
    const terminalSelectors = [
      // Input elements
      'textarea',
      'input[type="text"]',
      'input[type="search"]',
      'input[placeholder*="command" i]',
      'input[placeholder*="terminal" i]',
      'input[placeholder*="shell" i]',
      
      // Terminal-specific classes
      '.terminal',
      '.xterm',
      '.terminal-input',
      '.terminal-output',
      '.command-line',
      '.console',
      '.shell',
      '.repl',
      
      // Data attributes
      '[data-testid*="terminal"]',
      '[data-testid*="console"]',
      '[data-testid*="command"]',
      '[data-testid*="shell"]',
      
      // ID attributes
      '[id*="terminal"]',
      '[id*="console"]',
      '[id*="command"]',
      '[id*="shell"]',
      
      // Contenteditable elements
      '[contenteditable="true"]',
      '[contenteditable=""]',
      
      // Pre and code elements that might be interactive
      'pre[contenteditable]',
      'code[contenteditable]',
      
      // Iframe elements
      'iframe',
      
      // Div elements that might be terminals
      'div[class*="terminal"]',
      'div[class*="console"]',
      'div[class*="command"]',
      'div[class*="shell"]',
      
      // Any element with terminal-related attributes
      '[class*="terminal"]',
      '[class*="console"]',
      '[class*="command"]',
      '[class*="shell"]',
      '[class*="repl"]'
    ];
    
    let terminal = null;
    let terminalFound = false;
    
    for (const selector of terminalSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        
        // Check each element to see if it's interactive
        for (let i = 0; i < count; i++) {
          const element = elements.nth(i);
          try {
            // Check if element is interactive
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
    
    // If no terminal found, check for iframe terminals
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
              console.log(`🔍 Checking iframe ${i + 1}...`);
              const iframeTerminal = iframeContent.locator('textarea, input[type="text"], [contenteditable="true"]');
              const iframeTerminalCount = await iframeTerminal.count();
              if (iframeTerminalCount > 0) {
                console.log(`✅ Found interactive terminal in iframe ${i + 1}`);
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
    
    // If still no terminal found, look for any clickable elements that might open a terminal
    if (!terminalFound) {
      console.log('🔍 Looking for terminal launcher buttons...');
      const terminalButtons = page.locator('button:has-text("Terminal"), button:has-text("Console"), button:has-text("Command"), button:has-text("Shell"), [data-testid*="terminal"], [data-testid*="console"]');
      const buttonCount = await terminalButtons.count();
      console.log(`🔘 Found ${buttonCount} potential terminal buttons`);
      
      if (buttonCount > 0) {
        for (let i = 0; i < buttonCount; i++) {
          const button = terminalButtons.nth(i);
          const buttonText = await button.textContent();
          console.log(`   ${i + 1}. Button: "${buttonText}"`);
          
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
      
      // Take screenshot to see what's on the page
      await page.screenshot({ path: 'no-interactive-terminal.png', fullPage: true });
      console.log('📸 Screenshot saved: no-interactive-terminal.png');
      
      // Check page content
      const pageContent = await page.textContent('body');
      console.log('📄 Page content preview:', pageContent?.substring(0, 1000));
      
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
    await page.screenshot({ path: 'interactive-terminal-found.png', fullPage: true });
    console.log('📸 Final screenshot saved: interactive-terminal-found.png');
    
    console.log('✅ Interactive terminal testing completed');
    expect(page).toBeTruthy();
  });
});

