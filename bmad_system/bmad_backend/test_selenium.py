#!/usr/bin/env python3
"""
Simple Selenium test script to verify installation in Docker container
"""

import os
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def test_selenium_installation():
    """Test Selenium installation and headless Chrome"""
    try:
        print("🔍 Testing Selenium installation...")
        
        # Configure Chrome options for headless mode
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        # Set binary path
        chrome_options.binary_location = "/usr/bin/google-chrome"
        
        print("🚀 Starting Chrome in headless mode...")
        driver = webdriver.Chrome(options=chrome_options)
        
        print("🌐 Navigating to a test page...")
        driver.get("https://www.google.com")
        
        # Wait for page to load
        wait = WebDriverWait(driver, 10)
        title_element = wait.until(EC.presence_of_element_located((By.TAG_NAME, "title")))
        
        print(f"✅ Page title: {driver.title}")
        print(f"✅ Current URL: {driver.current_url}")
        
        # Take a screenshot
        screenshot_path = "/tmp/selenium_test_screenshot.png"
        driver.save_screenshot(screenshot_path)
        print(f"📸 Screenshot saved to: {screenshot_path}")
        
        driver.quit()
        print("✅ Selenium test completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Selenium test failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_selenium_installation()
    sys.exit(0 if success else 1)
