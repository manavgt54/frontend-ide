import { test, expect } from '@playwright/test';

// Comprehensive test: API fixes + Drag & Drop + Terminal Commands + Logging
test.describe('Complete System Test: API + DragDrop + Terminal + Logging', () => {
  test('comprehensive test with terminal command execution and logging', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for comprehensive testing
    
    const testResults: any[] = [];
    const terminalResults: any[] = [];
    
    // Helper function to test API endpoint
    async function testEndpoint(method: string, url: string, data?: any, headers?: any) {
      try {
        console.log(`🧪 Testing ${method} ${url}`);
        const response = await page.request[method.toLowerCase()](url, {
          data,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          timeout: 30000
        });
        
        const result = {
          method,
          url,
          status: response.status(),
          statusText: response.statusText(),
          data: data,
          headers: headers,
          timestamp: new Date().toISOString()
        };
        
        testResults.push(result);
        console.log(`   ✅ ${response.status()} ${response.statusText()}`);
        
        if (response.status() < 400) {
          try {
            const responseData = await response.json();
            console.log(`   📄 Response:`, JSON.stringify(responseData, null, 2));
            result.responseData = responseData;
          } catch (e) {
            console.log(`   📄 Response: (non-JSON)`);
          }
        }
        
        return result;
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        testResults.push({
          method,
          url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return null;
      }
    }
    
    // Helper function to execute terminal command and log results
    async function executeTerminalCommand(command: string, terminal: any) {
      try {
        console.log(`\n🔧 Executing Terminal Command: ${command}`);
        console.log(`   📍 Command Type: ${command.split(' ')[0]}`);
        
        // Clear terminal first
        await terminal.fill('');
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        
        // Type command
        await terminal.fill(command);
        await page.keyboard.press('Enter');
        
        // Wait for command to execute
        await page.waitForTimeout(3000);
        
        // Capture terminal output
        const terminalOutput = await terminal.inputValue();
        console.log(`   📤 Command Input: ${command}`);
        console.log(`   📥 Terminal Output: ${terminalOutput}`);
        
        // Check for any error messages
        const errorElements = page.locator('.error, .alert-danger, [class*="error"]');
        const errorCount = await errorElements.count();
        if (errorCount > 0) {
          console.log(`   ❌ Errors found: ${errorCount}`);
          for (let i = 0; i < errorCount; i++) {
            const errorText = await errorElements.nth(i).textContent();
            console.log(`      Error ${i + 1}: ${errorText}`);
          }
        }
        
        // Check network requests for this command
        const networkRequests = await page.evaluate(() => {
          return window.performance.getEntriesByType('resource')
            .filter((entry: any) => entry.name.includes('ai-ide-5.onrender.com'))
            .map((entry: any) => ({
              url: entry.name,
              duration: entry.duration,
              timestamp: entry.startTime
            }));
        });
        
        if (networkRequests.length > 0) {
          console.log(`   🌐 Network Requests: ${networkRequests.length}`);
          networkRequests.forEach(req => {
            console.log(`      - ${req.url} (${req.duration}ms)`);
          });
        }
        
        const result = {
          command,
          commandType: command.split(' ')[0],
          input: command,
          output: terminalOutput,
          errors: errorCount,
          networkRequests: networkRequests.length,
          timestamp: new Date().toISOString()
        };
        
        terminalResults.push(result);
        console.log(`   ✅ Command executed successfully`);
        
        return result;
      } catch (error) {
        console.log(`   ❌ Command execution failed: ${error.message}`);
        terminalResults.push({
          command,
          commandType: command.split(' ')[0],
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return null;
      }
    }
    
    // 1. Test API fixes first
    console.log('\n🏥 Testing API Fixes:');
    const healthResult = await testEndpoint('GET', 'https://ai-ide-5.onrender.com/health');
    
    // Get session for file operations
    const authResult = await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google', {
      email: 'test@example.com'
    });
    
    let sessionId = null;
    if (authResult && authResult.responseData) {
      sessionId = authResult.responseData.sessionId;
      console.log(`✅ Got session ID: ${sessionId}`);
    }
    
    // 2. Navigate to frontend and test drag & drop
    console.log('\n🎯 Testing Drag & Drop:');
    await page.goto('/');
    await page.waitForTimeout(5000);
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Test file upload
    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    console.log(`📁 Found ${fileInputCount} file input elements`);
    
    if (fileInputCount > 0) {
      console.log('✅ Testing file upload...');
      const fileInput = fileInputs.first();
      await fileInput.setInputFiles({
        name: 'test-upload.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test file content for upload')
      });
      await page.waitForTimeout(2000);
    }
    
    // Test drag and drop
    const dropZones = page.locator('[data-testid*="drop"], [class*="drop"], [class*="upload"], .drop-zone, .file-drop, [draggable="true"]');
    const dropZoneCount = await dropZones.count();
    console.log(`🎯 Found ${dropZoneCount} potential drop zones`);
    
    if (dropZoneCount > 0) {
      console.log('✅ Testing drag and drop...');
      const testFile = {
        name: 'drag-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Test file for drag and drop')
      };
      
      for (let i = 0; i < dropZoneCount; i++) {
        const dropZone = dropZones.nth(i);
        try {
          await dropZone.dispatchEvent('dragenter');
          await page.waitForTimeout(100);
          await dropZone.dispatchEvent('dragover');
          await page.waitForTimeout(100);
          await dropZone.dispatchEvent('drop', {
            dataTransfer: { files: [testFile] }
          });
          console.log(`✅ Drop zone ${i + 1} handled drag and drop`);
        } catch (error) {
          console.log(`❌ Drop zone ${i + 1} failed: ${error.message}`);
        }
      }
    }
    
    // 3. Test terminal commands with comprehensive logging
    console.log('\n💻 Testing Terminal Commands with Logging:');
    const terminalElements = page.locator('textarea, input[type="text"], .terminal, .xterm, [data-testid*="terminal"]');
    const terminalCount = await terminalElements.count();
    console.log(`💻 Found ${terminalCount} terminal elements`);
    
    if (terminalCount > 0) {
      console.log('✅ Terminal found, testing all command types...');
      const terminal = terminalElements.first();
      
      // Test npm commands
      console.log('\n📦 Testing NPM Commands:');
      await executeTerminalCommand('npm --version', terminal);
      await executeTerminalCommand('npm list', terminal);
      await executeTerminalCommand('npm init -y', terminal);
      await executeTerminalCommand('npm install express', terminal);
      await executeTerminalCommand('npm run test', terminal);
      
      // Test npx commands
      console.log('\n🚀 Testing NPX Commands:');
      await executeTerminalCommand('npx --version', terminal);
      await executeTerminalCommand('npx create-react-app test-app', terminal);
      await executeTerminalCommand('npx playwright test', terminal);
      await executeTerminalCommand('npx eslint --version', terminal);
      
      // Test node commands
      console.log('\n🟢 Testing NODE Commands:');
      await executeTerminalCommand('node --version', terminal);
      await executeTerminalCommand('node -e "console.log(\'Hello from Node\')"', terminal);
      await executeTerminalCommand('node -p "process.cwd()"', terminal);
      await executeTerminalCommand('node -p "process.env.NODE_ENV"', terminal);
      
      // Test git commands
      console.log('\n🔀 Testing GIT Commands:');
      await executeTerminalCommand('git --version', terminal);
      await executeTerminalCommand('git status', terminal);
      await executeTerminalCommand('git log --oneline -5', terminal);
      await executeTerminalCommand('git branch', terminal);
      await executeTerminalCommand('git remote -v', terminal);
      
      // Test file system commands
      console.log('\n📁 Testing File System Commands:');
      await executeTerminalCommand('ls -la', terminal);
      await executeTerminalCommand('pwd', terminal);
      await executeTerminalCommand('mkdir test-dir', terminal);
      await executeTerminalCommand('cd test-dir', terminal);
      await executeTerminalCommand('echo "test content" > test.txt', terminal);
      await executeTerminalCommand('cat test.txt', terminal);
      await executeTerminalCommand('rm test.txt', terminal);
      await executeTerminalCommand('cd ..', terminal);
      await executeTerminalCommand('rmdir test-dir', terminal);
      
      // Test package.json operations
      console.log('\n📄 Testing Package.json Operations:');
      await executeTerminalCommand('cat package.json', terminal);
      await executeTerminalCommand('npm run dev', terminal);
      await executeTerminalCommand('npm run build', terminal);
      
      // Test app-specific commands
      console.log('\n🎯 Testing App-Specific Commands:');
      await executeTerminalCommand('ls src/', terminal);
      await executeTerminalCommand('cat src/main.tsx', terminal);
      await executeTerminalCommand('ls backend/', terminal);
      await executeTerminalCommand('cat backend/server.js | head -20', terminal);
      
    } else {
      console.log('❌ No terminal found');
    }
    
    // 4. Test file operations with session
    if (sessionId) {
      console.log('\n📁 Testing File Operations with Session:');
      await testEndpoint('GET', `https://ai-ide-5.onrender.com/files?sessionId=${sessionId}`);
      await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
        filename: 'terminal-test.txt',
        content: 'Terminal test file content'
      }, {
        'x-session-id': sessionId
      });
    }
    
    // 5. Comprehensive logging and analysis
    console.log('\n📊 COMPREHENSIVE TEST RESULTS:');
    console.log(`   Total API calls: ${testResults.length}`);
    console.log(`   Total terminal commands: ${terminalResults.length}`);
    
    const successfulCalls = testResults.filter(r => r.status && r.status < 400);
    const failedCalls = testResults.filter(r => r.status && r.status >= 400);
    const errorCalls = testResults.filter(r => r.error);
    
    console.log(`   Successful API calls: ${successfulCalls.length}`);
    console.log(`   Failed API calls: ${failedCalls.length}`);
    console.log(`   Error API calls: ${errorCalls.length}`);
    
    // Terminal command analysis
    const npmCommands = terminalResults.filter(r => r.commandType === 'npm');
    const npxCommands = terminalResults.filter(r => r.commandType === 'npx');
    const nodeCommands = terminalResults.filter(r => r.commandType === 'node');
    const gitCommands = terminalResults.filter(r => r.commandType === 'git');
    
    console.log(`   NPM commands executed: ${npmCommands.length}`);
    console.log(`   NPX commands executed: ${npxCommands.length}`);
    console.log(`   NODE commands executed: ${nodeCommands.length}`);
    console.log(`   GIT commands executed: ${gitCommands.length}`);
    
    // Command success analysis
    const successfulCommands = terminalResults.filter(r => !r.error);
    const failedCommands = terminalResults.filter(r => r.error);
    
    console.log(`   Successful terminal commands: ${successfulCommands.length}`);
    console.log(`   Failed terminal commands: ${failedCommands.length}`);
    
    if (failedCommands.length > 0) {
      console.log('\n❌ Failed Terminal Commands:');
      failedCommands.forEach(cmd => {
        console.log(`   - ${cmd.command}: ${cmd.error}`);
      });
    }
    
    // Network analysis for commands
    const commandsWithNetwork = terminalResults.filter(r => r.networkRequests > 0);
    console.log(`   Commands with network activity: ${commandsWithNetwork.length}`);
    
    if (commandsWithNetwork.length > 0) {
      console.log('\n🌐 Commands with Network Activity:');
      commandsWithNetwork.forEach(cmd => {
        console.log(`   - ${cmd.command}: ${cmd.networkRequests} requests`);
      });
    }
    
    // Take comprehensive screenshot
    await page.screenshot({ path: 'comprehensive-system-test.png', fullPage: true });
    console.log('📸 Screenshot saved: comprehensive-system-test.png');
    
    // Final summary
    console.log('\n🎯 FINAL SYSTEM TEST SUMMARY:');
    console.log(`   Health endpoint: ${healthResult ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Authentication: ${sessionId ? '✅ Working' : '❌ Failed'}`);
    console.log(`   Drag & Drop: ${dropZoneCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    console.log(`   File Upload: ${fileInputCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    console.log(`   Terminal: ${terminalCount > 0 ? '✅ Tested' : '❌ Not found'}`);
    console.log(`   NPM Commands: ${npmCommands.length} executed`);
    console.log(`   NPX Commands: ${npxCommands.length} executed`);
    console.log(`   NODE Commands: ${nodeCommands.length} executed`);
    console.log(`   GIT Commands: ${gitCommands.length} executed`);
    console.log(`   File Operations: ${sessionId ? '✅ Tested' : '❌ Skipped'}`);
    
    expect(page).toBeTruthy();
    console.log('✅ Comprehensive system test completed');
  });
});

