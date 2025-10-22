import { exec } from 'child_process';
import fetch from 'node-fetch';
import DatabaseLogger from './database-logger.js';

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'https://ai-ide-5.onrender.com';

console.log('🚀 Starting Comprehensive Test with Backend + Database Logging...\n');

class ComprehensiveTestRunner {
  constructor() {
    this.dbLogger = new DatabaseLogger();
    this.backendCalls = [];
    this.testSessionId = `test-session-${Date.now()}`;
  }

  async fetchBackendLogs() {
    try {
      console.log('📡 Fetching backend logs...');
      const response = await fetch(`${BACKEND_URL}/logs`);
      
      if (response.ok) {
        const logs = await response.text();
        console.log('📋 Backend Logs:');
        console.log('='.repeat(50));
        console.log(logs);
        console.log('='.repeat(50));
        return logs;
      } else {
        console.log(`❌ Failed to fetch logs: ${response.status} ${response.statusText}`);
        return null;
      }
    } catch (error) {
      console.log(`❌ Error fetching logs: ${error.message}`);
      return null;
    }
  }

  async runPlaywrightTest() {
    return new Promise((resolve, reject) => {
      console.log('🎭 Running Playwright test...');
      
      const testProcess = exec('npx playwright test test-drag-drop.spec.ts --headed', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Test execution error:', error);
          reject(error);
          return;
        }
        
        console.log('✅ Playwright test completed');
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

  async runDatabaseAnalysis() {
    try {
      console.log('\n🗄️ DATABASE ANALYSIS');
      console.log('='.repeat(60));
      
      // Connect to database
      const connected = await this.dbLogger.connect();
      if (!connected) {
        console.log('❌ Cannot connect to database, skipping database analysis');
        return;
      }
      
      // Get comprehensive database stats
      await this.dbLogger.getDatabaseStats();
      
      // Get recent activity
      await this.dbLogger.getRecentActivity(1); // Last hour
      
      // Search for test files
      await this.dbLogger.searchFiles('test');
      
      // Look for our test session
      await this.dbLogger.getSessionDetails(this.testSessionId);
      
    } catch (error) {
      console.error('❌ Database analysis failed:', error);
    } finally {
      await this.dbLogger.disconnect();
    }
  }

  async runBackendAnalysis() {
    try {
      console.log('\n📡 BACKEND ANALYSIS');
      console.log('='.repeat(60));
      
      // Test backend connectivity
      console.log('1. Testing backend connectivity...');
      const healthResponse = await fetch(`${BACKEND_URL}/health`);
      if (healthResponse.ok) {
        console.log('✅ Backend is accessible');
      } else {
        console.log(`⚠️ Backend health check failed: ${healthResponse.status}`);
      }
      
      // Test files endpoint
      console.log('\n2. Testing files endpoint...');
      const filesResponse = await fetch(`${BACKEND_URL}/files`);
      if (filesResponse.ok) {
        const filesData = await filesResponse.json();
        console.log('✅ Files endpoint accessible');
        console.log(`📁 Files count: ${filesData.files?.length || 0}`);
      } else {
        console.log(`⚠️ Files endpoint failed: ${filesResponse.status}`);
      }
      
      // Test workspace upload endpoint
      console.log('\n3. Testing workspace upload endpoint...');
      const testPayload = {
        files: [
          { path: 'test-comprehensive.js', content: 'console.log("Comprehensive test file");' }
        ],
        sessionId: this.testSessionId
      };
      
      const uploadResponse = await fetch(`${BACKEND_URL}/files/workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.testSessionId
        },
        body: JSON.stringify(testPayload)
      });
      
      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        console.log('✅ Workspace upload endpoint accessible');
        console.log('Upload response:', JSON.stringify(uploadData, null, 2));
      } else {
        console.log(`⚠️ Workspace upload failed: ${uploadResponse.status}`);
        const errorText = await uploadResponse.text();
        console.log('Error details:', errorText);
      }
      
    } catch (error) {
      console.error('❌ Backend analysis failed:', error);
    }
  }

  async runComprehensiveTest() {
    try {
      console.log('🚀 STARTING COMPREHENSIVE TEST SUITE');
      console.log('='.repeat(80));
      
      // Phase 1: Pre-test analysis
      console.log('\n📊 PHASE 1: PRE-TEST ANALYSIS');
      console.log('='.repeat(40));
      
      await this.fetchBackendLogs();
      await this.runBackendAnalysis();
      await this.runDatabaseAnalysis();
      
      // Phase 2: Run Playwright test
      console.log('\n🎭 PHASE 2: PLAYWRIGHT TEST EXECUTION');
      console.log('='.repeat(40));
      
      await this.runPlaywrightTest();
      
      // Phase 3: Post-test analysis
      console.log('\n📊 PHASE 3: POST-TEST ANALYSIS');
      console.log('='.repeat(40));
      
      await this.fetchBackendLogs();
      await this.runDatabaseAnalysis();
      
      console.log('\n✅ COMPREHENSIVE TEST SUITE COMPLETED');
      console.log('='.repeat(80));
      
    } catch (error) {
      console.error('❌ Comprehensive test failed:', error);
      process.exit(1);
    }
  }
}

// Run the comprehensive test
const runner = new ComprehensiveTestRunner();
runner.runComprehensiveTest();
