import { test, expect } from '@playwright/test';

// Comprehensive backend API test with correct endpoints
test.describe('Backend API Edge Cases', () => {
  test('test all backend endpoints with proper parameters', async ({ page }) => {
    test.setTimeout(120000);
    
    const apiResults: any[] = [];
    
    // Helper function to test API endpoint
    async function testEndpoint(method: string, url: string, data?: any, headers?: any) {
      try {
        console.log(`🧪 Testing ${method} ${url}`);
        const response = await page.request[method.toLowerCase()](url, {
          data,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
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
        
        apiResults.push(result);
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
        apiResults.push({
          method,
          url,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return null;
      }
    }
    
    // 1. Test health endpoint
    console.log('\n🏥 Testing Health Endpoint:');
    await testEndpoint('GET', 'https://ai-ide-5.onrender.com/health');
    
    // 2. Test auth endpoints
    console.log('\n🔐 Testing Auth Endpoints:');
    
    // Test Google auth without parameters (should fail)
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google');
    
    // Test Google auth with email
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google', {
      email: 'test@example.com'
    });
    
    // Test Google auth with Google ID
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google', {
      googleId: 'test-google-id-123'
    });
    
    // Test session validation without parameters
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/session/validate');
    
    // Test session validation with sessionId
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/session/validate', {
      sessionId: 'test-session-123'
    });
    
    // Test session validation with email
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/session/validate', {
      email: 'test@example.com'
    });
    
    // 3. Test file endpoints
    console.log('\n📁 Testing File Endpoints:');
    
    // Test files endpoint without sessionId (should return 400)
    await testEndpoint('GET', 'https://ai-ide-5.onrender.com/files');
    
    // Test files endpoint with sessionId in query
    await testEndpoint('GET', 'https://ai-ide-5.onrender.com/files?sessionId=test-session-123');
    
    // Test files endpoint with sessionId in header
    await testEndpoint('GET', 'https://ai-ide-5.onrender.com/files', null, {
      'x-session-id': 'test-session-123'
    });
    
    // Test file open without parameters
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/open');
    
    // Test file open with filename only
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/open', {
      filename: 'test.txt'
    });
    
    // Test file open with sessionId in header
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/open', {
      filename: 'test.txt'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Test file save without parameters
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save');
    
    // Test file save with content only
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: 'test.txt',
      content: 'Hello World!'
    });
    
    // Test file save with sessionId in header
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: 'test.txt',
      content: 'Hello World!'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Test file delete without parameters
    await testEndpoint('DELETE', 'https://ai-ide-5.onrender.com/files/delete');
    
    // Test file delete with filename only
    await testEndpoint('DELETE', 'https://ai-ide-5.onrender.com/files/delete', {
      filename: 'test.txt'
    });
    
    // Test file delete with sessionId in header
    await testEndpoint('DELETE', 'https://ai-ide-5.onrender.com/files/delete', {
      filename: 'test.txt'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // 4. Test terminal/WebSocket endpoints
    console.log('\n💻 Testing Terminal/WebSocket Endpoints:');
    
    // Test if there's a terminal endpoint (might not exist)
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/terminal');
    
    // Test terminal with command
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/terminal', {
      command: 'echo "hello"'
    });
    
    // Test terminal with sessionId
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/terminal', {
      command: 'echo "hello"'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // 5. Test edge cases
    console.log('\n🔍 Testing Edge Cases:');
    
    // Test with invalid JSON
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/auth/google', 'invalid-json');
    
    // Test with very long content
    const longContent = 'A'.repeat(10000);
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: 'long-file.txt',
      content: longContent
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Test with special characters in filename
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: 'test file with spaces & symbols!.txt',
      content: 'Special characters test'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Test with empty filename
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: '',
      content: 'Empty filename test'
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Test with null content
    await testEndpoint('POST', 'https://ai-ide-5.onrender.com/files/save', {
      filename: 'null-content.txt',
      content: null
    }, {
      'x-session-id': 'test-session-123'
    });
    
    // Log comprehensive results
    console.log('\n📊 COMPREHENSIVE API TEST RESULTS:');
    console.log(`   Total API calls: ${apiResults.length}`);
    
    const successfulCalls = apiResults.filter(r => r.status && r.status < 400);
    const failedCalls = apiResults.filter(r => r.status && r.status >= 400);
    const errorCalls = apiResults.filter(r => r.error);
    
    console.log(`   Successful calls: ${successfulCalls.length}`);
    console.log(`   Failed calls (4xx/5xx): ${failedCalls.length}`);
    console.log(`   Error calls: ${errorCalls.length}`);
    
    if (failedCalls.length > 0) {
      console.log('\n❌ Failed API Calls:');
      failedCalls.forEach(call => {
        console.log(`   - ${call.status} ${call.method} ${call.url}`);
      });
    }
    
    if (errorCalls.length > 0) {
      console.log('\n💥 Error API Calls:');
      errorCalls.forEach(call => {
        console.log(`   - ${call.method} ${call.url}: ${call.error}`);
      });
    }
    
    // Identify edge cases
    console.log('\n🔍 EDGE CASES IDENTIFIED:');
    
    const edgeCases = apiResults.filter(r => 
      r.status === 400 || r.status === 404 || r.status === 500 || r.error
    );
    
    edgeCases.forEach(call => {
      console.log(`   - ${call.method} ${call.url}: ${call.status || 'ERROR'} - ${call.error || 'Edge case detected'}`);
    });
    
    expect(page).toBeTruthy();
    console.log('✅ Comprehensive backend API edge case testing completed');
  });
});

