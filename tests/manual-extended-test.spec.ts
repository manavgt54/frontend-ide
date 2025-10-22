import { test, expect } from '@playwright/test';

// Test that keeps browser open for manual interaction
test.describe('Manual Terminal Testing - Extended Time', () => {
  test('open dashboard and keep browser open for manual testing', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes - much longer timeout
    
    console.log('🚀 Opening Dashboard for Manual Testing...');
    
    // Navigate to the correct dashboard URL
    console.log('📍 Navigating to localhost:5173/dashboard...');
    await page.goto('http://localhost:5173/dashboard', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Wait for page to fully load
    await page.waitForTimeout(5000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'dashboard-initial.png', fullPage: true });
    console.log('📸 Initial screenshot saved: dashboard-initial.png');
    
    // Look for terminal elements and log what we find
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
    
    for (const selector of terminalSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements with selector: ${selector}`);
        terminalFound = true;
        
        // Log details about each element
        for (let i = 0; i < count; i++) {
          const element = elements.nth(i);
          const tagName = await element.evaluate(el => el.tagName);
          const className = await element.getAttribute('class');
          const id = await element.getAttribute('id');
          const placeholder = await element.getAttribute('placeholder');
          const isEditable = await element.evaluate(el => {
            return el.tagName === 'INPUT' || 
                   el.tagName === 'TEXTAREA' || 
                   el.contentEditable === 'true' ||
                   el.contentEditable === '' ||
                   el.getAttribute('role') === 'textbox';
          });
          
          console.log(`   Element ${i + 1}: ${tagName} class="${className}" id="${id}" placeholder="${placeholder}" editable=${isEditable}`);
        }
      }
    }
    
    if (!terminalFound) {
      console.log('❌ No terminal elements found');
    }
    
    // Look for any buttons that might open a terminal
    console.log('🔍 Looking for terminal launcher buttons...');
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`🔘 Found ${buttonCount} buttons`);
    
    if (buttonCount > 0) {
      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const button = buttons.nth(i);
        const buttonText = await button.textContent();
        const buttonClass = await button.getAttribute('class');
        console.log(`   Button ${i + 1}: "${buttonText}" class="${buttonClass}"`);
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
    
    // Log page content for analysis
    const pageContent = await page.textContent('body');
    console.log('📄 Page content preview:', pageContent?.substring(0, 500));
    
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
    await page.screenshot({ path: 'dashboard-after-manual-test.png', fullPage: true });
    console.log('📸 Final screenshot saved: dashboard-after-manual-test.png');
    
    console.log('✅ Manual testing time completed');
    expect(page).toBeTruthy();
  });
  
  test('test with even longer timeout for extended manual testing', async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes - very long timeout
    
    console.log('🚀 Extended Manual Testing - 20 minutes...');
    
    // Navigate to dashboard
    await page.goto('http://localhost:5173/dashboard', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    console.log('📍 Dashboard loaded, waiting for manual testing...');
    console.log('⏰ Browser will stay open for 20 minutes');
    console.log('   Test everything you need:');
    console.log('   - Terminal commands (npm, npx, node, git)');
    console.log('   - Drag and drop functionality');
    console.log('   - File operations');
    console.log('   - Any other features');
    
    // Wait for 20 minutes
    await page.waitForTimeout(1200000); // 20 minutes
    
    console.log('✅ Extended manual testing completed');
    expect(page).toBeTruthy();
  });
});

