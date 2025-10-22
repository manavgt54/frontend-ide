const { exec } = require('child_process');
const fetch = require('node-fetch');

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'https://ai-ide-5.onrender.com';

console.log('🚀 Starting Playwright Test with Backend Log Monitoring...\n');

// Function to fetch backend logs
async function fetchBackendLogs() {
  try {
    console.log('📡 Fetching backend logs...');
    const response = await fetch(`${BACKEND_URL}/logs`);
    
    if (response.ok) {
      const logs = await response.text();
      console.log('📋 Backend Logs:');
      console.log('='.repeat(50));
      console.log(logs);
      console.log('='.repeat(50));
    } else {
      console.log(`❌ Failed to fetch logs: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error fetching logs: ${error.message}`);
  }
}

// Function to run Playwright test
function runPlaywrightTest() {
  return new Promise((resolve, reject) => {
    console.log('🎭 Running Playwright test...');
    
    const testProcess = exec('npx playwright test test-drag-drop.spec.ts --headed', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Test execution error:', error);
        reject(error);
        return;
      }
      
      console.log('✅ Test completed');
      console.log('📊 Test Output:');
      console.log(stdout);
      
      if (stderr) {
        console.log('⚠️ Test Warnings/Errors:');
        console.log(stderr);
      }
      
      resolve({ stdout, stderr });
    });
    
    // Monitor test output in real-time
    testProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    testProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}

// Main execution
async function main() {
  try {
    // First, fetch initial backend logs
    await fetchBackendLogs();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎭 STARTING PLAYWRIGHT TEST');
    console.log('='.repeat(60));
    
    // Run the Playwright test
    await runPlaywrightTest();
    
    console.log('\n' + '='.repeat(60));
    console.log('📡 FETCHING POST-TEST BACKEND LOGS');
    console.log('='.repeat(60));
    
    // Fetch logs after test
    await fetchBackendLogs();
    
    console.log('\n✅ Test execution completed successfully!');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();

