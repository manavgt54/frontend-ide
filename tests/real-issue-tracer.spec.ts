import { test, expect } from '@playwright/test'

test.describe('Real Issue Tracer - Drag & Drop and Terminal Detection', () => {
  test('trace real drag & drop and terminal issues', async ({ page }) => {
    // Enable console logging to see all issues
    page.on('console', msg => {
      console.log(`🔍 CONSOLE [${msg.type()}]: ${msg.text()}`)
    })
    
    // Enable network monitoring with error handling
    page.on('request', request => {
      console.log(`📤 REQUEST: ${request.method()} ${request.url()}`)
    })
    
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`❌ ERROR RESPONSE: ${response.status()} ${response.url()}`)
      } else {
        console.log(`📥 RESPONSE: ${response.status()} ${response.url()}`)
      }
    })
    
    // Handle failed requests
    page.on('requestfailed', request => {
      console.log(`💥 REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`)
    })
    
    // Navigate to the app
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
    
    // Check if we're on login page and handle it
    const isLoginPage = await page.locator('text=Sign in').isVisible().catch(() => false)
    if (isLoginPage) {
      console.log('🔐 LOGIN PAGE DETECTED - HANDLING LOGIN')
      
      // Try to find and click "Continue with Email" button
      const continueButton = page.locator('button:has-text("Continue with Email")')
      if (await continueButton.isVisible()) {
        await continueButton.click()
        await page.waitForTimeout(3000)
        console.log('✅ CLICKED CONTINUE WITH EMAIL')
      }
      
      // Wait for redirect to main app
      await page.waitForTimeout(5000)
    }
    
    // Wait for main app (either already loaded or after login)
    try {
      await page.waitForSelector('.terminal-container', { timeout: 30000 })
      console.log('✅ MAIN APP LOADED')
    } catch (error) {
      console.log('❌ MAIN APP NOT LOADED - CHECKING CURRENT PAGE')
      const currentUrl = page.url()
      console.log('📍 CURRENT URL:', currentUrl)
      
      // If still on login, try to navigate directly to root
      if (currentUrl.includes('/login')) {
        console.log('🔄 ATTEMPTING DIRECT NAVIGATION TO ROOT')
        await page.goto('http://localhost:5173/')
        await page.waitForTimeout(3000)
      }
    }
    
    // Inject debugging code to trace drag & drop issues
    await page.evaluate(() => {
      console.log('🔧 INJECTING DEBUG CODE...')
      
      // Override console.log to capture all logs
      const originalLog = console.log
      console.log = (...args) => {
        originalLog(...args)
        // Store logs for later analysis
        if (!window.debugLogs) window.debugLogs = []
        window.debugLogs.push(args.join(' '))
      }
      
      // Monitor drag & drop events
      document.addEventListener('dragover', (e) => {
        console.log('🎯 DRAG OVER:', e.target, e.dataTransfer?.types)
      })
      
      document.addEventListener('drop', (e) => {
        console.log('🎯 DROP EVENT:', e.target, e.dataTransfer?.files.length, 'files')
        if (e.dataTransfer?.files) {
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i]
            console.log(`📁 DROPPED FILE ${i}:`, file.name, file.webkitRelativePath || 'no path')
          }
        }
      })
      
      // Monitor terminal events
      const terminalContainer = document.querySelector('.terminal-container')
      if (terminalContainer) {
        console.log('🖥️ TERMINAL CONTAINER FOUND')
        
        // Check if terminal has proper event listeners
        const terminalElement = terminalContainer.querySelector('.xterm-screen')
        if (terminalElement) {
          console.log('🖥️ TERMINAL ELEMENT FOUND')
        }
      }
      
      // Monitor file upload API calls
      const originalFetch = window.fetch
      window.fetch = (...args) => {
        console.log('🌐 FETCH CALL:', args[0])
        return originalFetch(...args).then(response => {
          console.log('🌐 FETCH RESPONSE:', response.status, args[0])
          return response
        })
      }
      
      // Check for terminal-change-dir event listener
      const hasTerminalChangeDir = document.addEventListener.toString().includes('terminal-change-dir')
      console.log('🔄 TERMINAL CHANGE DIR LISTENER:', hasTerminalChangeDir)
      
      // Check if Explorer component has proper drop handling
      const explorer = document.querySelector('.explorer')
      if (explorer) {
        console.log('📁 EXPLORER FOUND')
        
        // Check if it has proper event listeners
        const hasDropListener = explorer.ondrop !== null
        console.log('📁 EXPLORER HAS DROP LISTENER:', hasDropListener)
      }
    })
    
    console.log('🔍 DEBUGGING CODE INJECTED - READY FOR MANUAL TESTING')
    console.log('📋 MANUAL TEST STEPS:')
    console.log('   1. Open browser dev tools (F12)')
    console.log('   2. Go to Console tab')
    console.log('   3. Try dragging a folder with files')
    console.log('   4. Watch console for drag & drop events')
    console.log('   5. Check if terminal working directory changes')
    console.log('   6. Run "ls" command in terminal')
    console.log('   7. Check if files appear correctly')
    
    // Keep browser open for 15 minutes for detailed manual testing
    console.log('⏰ BROWSER WILL STAY OPEN FOR 15 MINUTES')
    console.log('🕐 You have plenty of time to:')
    console.log('   - Login and navigate around')
    console.log('   - Test drag & drop multiple times')
    console.log('   - Check terminal commands')
    console.log('   - Verify file structure')
    console.log('   - Test different scenarios')
    
    // Add error handling to prevent early closure
    try {
      await page.waitForTimeout(900000) // 15 minutes = 900,000 ms
    } catch (error) {
      console.log('❌ Test interrupted:', error)
      // Even if interrupted, try to keep browser open
      await page.waitForTimeout(30000) // 30 seconds minimum
    }
    
    // Get all debug logs
    const debugLogs = await page.evaluate(() => {
      return window.debugLogs || []
    })
    
    console.log('📊 DEBUG LOGS COLLECTED:')
    debugLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log}`)
    })
  })
})
