const BACKEND_URL = 'https://ai-ide-5.onrender.com';

async function fetchRenderLogs() {
  console.log('🔍 Fetching logs from your Render backend...\n');
  
  try {
    // Test if the logging endpoint exists
    console.log('1. Testing if logging endpoint exists...');
    const testResponse = await fetch(`${BACKEND_URL}/logs`);
    
    if (testResponse.status === 404) {
      console.log('❌ Logging endpoint not found - backend needs to be updated with logging system');
      console.log('📝 The logging routes I added need to be deployed to your Render backend');
      return;
    }
    
    if (!testResponse.ok) {
      console.log(`❌ Backend error: ${testResponse.status}`);
      return;
    }
    
    console.log('✅ Logging endpoint found!');
    
    // Fetch all logs
    console.log('\n2. Fetching all logs...');
    const logsResponse = await fetch(`${BACKEND_URL}/logs?limit=50`);
    const logsData = await logsResponse.json();
    
    console.log(`📊 Total logs: ${logsData.total}`);
    console.log(`📊 Showing: ${logsData.filtered} logs\n`);
    
    // Display recent logs
    if (logsData.logs && logsData.logs.length > 0) {
      console.log('📋 Recent Logs:');
      console.log('='.repeat(80));
      
      logsData.logs.slice(0, 10).forEach((log, index) => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const level = log.level.toUpperCase().padEnd(5);
        const category = log.category.padEnd(10);
        
        console.log(`${index + 1}. [${timestamp}] ${level} ${category} ${log.message}`);
        
        if (log.data && Object.keys(log.data).length > 0) {
          console.log(`   Data: ${JSON.stringify(log.data, null, 2).substring(0, 100)}...`);
        }
        console.log('');
      });
    } else {
      console.log('📝 No logs found yet');
    }
    
    // Fetch database logs
    console.log('\n3. Fetching database logs...');
    const dbResponse = await fetch(`${BACKEND_URL}/logs/database`);
    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      console.log('✅ Database logs:');
      console.log(`📊 Users: ${dbData.database.stats.users}`);
      console.log(`📊 Sessions: ${dbData.database.stats.sessions}`);
      console.log(`📊 Files: ${dbData.database.stats.files}`);
      
      if (dbData.database.recentFiles && dbData.database.recentFiles.length > 0) {
        console.log('\n📁 Recent Files:');
        dbData.database.recentFiles.slice(0, 5).forEach(file => {
          console.log(`   - ${file.filename} (${file.session_id.substring(0, 8)}...) - ${file.size} bytes`);
        });
      }
    } else {
      console.log('❌ Database logs not available');
    }
    
    // Fetch log statistics
    console.log('\n4. Fetching log statistics...');
    const statsResponse = await fetch(`${BACKEND_URL}/logs/stats`);
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      console.log('✅ Log Statistics:');
      console.log(`📊 Total: ${statsData.stats.total}`);
      console.log(`📊 By Level:`, statsData.stats.byLevel);
      console.log(`📊 By Category:`, statsData.stats.byCategory);
    } else {
      console.log('❌ Log statistics not available');
    }
    
    console.log('\n✅ Log fetching completed!');
    console.log('\n🌐 To see real-time logs:');
    console.log('1. Open your frontend: npm run dev');
    console.log('2. Go to http://localhost:5173');
    console.log('3. Click the "Logs" icon in the sidebar');
    console.log('4. Drag and drop files to see live logging');
    
  } catch (error) {
    console.error('❌ Error fetching logs:', error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.log('\n💡 This means the logging endpoint doesn\'t exist yet on your Render backend.');
      console.log('📝 You need to deploy the updated backend with the logging system.');
    }
  }
}

// Run the log fetcher
fetchRenderLogs();
