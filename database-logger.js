import mysql from 'mysql2/promise';
import fetch from 'node-fetch';

// Aiven MySQL Database Configuration
const DB_CONFIG = {
  host: 'mysql-24b00d04-dekatc-d39e.h.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_FkeJInRYwsl-nOBEGIz',
  database: 'defaultdb',
  port: 14386,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 60000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const BACKEND_URL = 'https://ai-ide-5.onrender.com';

class DatabaseLogger {
  constructor() {
    this.pool = null;
    this.connection = null;
  }

  async connect() {
    try {
      console.log('🗄️ Connecting to Aiven MySQL database...');
      console.log(`🗄️ Host: ${DB_CONFIG.host}`);
      console.log(`🗄️ Port: ${DB_CONFIG.port}`);
      console.log(`🗄️ Database: ${DB_CONFIG.database}`);
      console.log(`🗄️ User: ${DB_CONFIG.user}`);
      
      this.pool = mysql.createPool(DB_CONFIG);
      
      // Test connection
      this.connection = await this.pool.getConnection();
      console.log('✅ Database connection established successfully');
      
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.release();
      this.connection = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    console.log('🔌 Database connection closed');
  }

  async getDatabaseStats() {
    try {
      console.log('\n📊 DATABASE STATISTICS');
      console.log('='.repeat(50));
      
      // Get users count
      const [users] = await this.connection.execute('SELECT COUNT(*) as count FROM users');
      console.log(`👥 Total Users: ${users[0].count}`);
      
      // Get sessions count
      const [sessions] = await this.connection.execute('SELECT COUNT(*) as count FROM sessions');
      console.log(`🔑 Total Sessions: ${sessions[0].count}`);
      
      // Get files count
      const [files] = await this.connection.execute('SELECT COUNT(*) as count FROM files');
      console.log(`📁 Total Files: ${files[0].count}`);
      
      // Get recent users
      const [recentUsers] = await this.connection.execute(`
        SELECT id, google_id, email, created_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      console.log('\n👤 Recent Users:');
      recentUsers.forEach(user => {
        console.log(`  - ID: ${user.id}, Email: ${user.email}, Created: ${user.created_at}`);
      });
      
      // Get recent sessions
      const [recentSessions] = await this.connection.execute(`
        SELECT s.session_id, s.user_id, u.email, s.created_at 
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        ORDER BY s.created_at DESC 
        LIMIT 5
      `);
      console.log('\n🔑 Recent Sessions:');
      recentSessions.forEach(session => {
        console.log(`  - Session: ${session.session_id}, User: ${session.email}, Created: ${session.created_at}`);
      });
      
      // Get recent files
      const [recentFiles] = await this.connection.execute(`
        SELECT f.filename, f.session_id, f.created_at, f.updated_at, LENGTH(f.content) as size
        FROM files f 
        ORDER BY f.updated_at DESC 
        LIMIT 10
      `);
      console.log('\n📁 Recent Files:');
      recentFiles.forEach(file => {
        console.log(`  - ${file.filename} (${file.size} bytes) - Session: ${file.session_id} - Updated: ${file.updated_at}`);
      });
      
      return {
        users: users[0].count,
        sessions: sessions[0].count,
        files: files[0].count,
        recentUsers,
        recentSessions,
        recentFiles
      };
      
    } catch (error) {
      console.error('❌ Error getting database stats:', error.message);
      throw error;
    }
  }

  async getSessionDetails(sessionId) {
    try {
      console.log(`\n🔍 SESSION DETAILS: ${sessionId}`);
      console.log('='.repeat(50));
      
      // Get session info
      const [sessionInfo] = await this.connection.execute(`
        SELECT s.session_id, s.user_id, u.email, u.google_id, s.created_at 
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.session_id = ?
      `, [sessionId]);
      
      if (sessionInfo.length === 0) {
        console.log('❌ Session not found');
        return null;
      }
      
      const session = sessionInfo[0];
      console.log(`👤 User: ${session.email} (Google ID: ${session.google_id})`);
      console.log(`🆔 User ID: ${session.user_id}`);
      console.log(`🔑 Session ID: ${session.session_id}`);
      console.log(`📅 Created: ${session.created_at}`);
      
      // Get files for this session
      const [sessionFiles] = await this.connection.execute(`
        SELECT filename, created_at, updated_at, LENGTH(content) as size
        FROM files 
        WHERE session_id = ? 
        ORDER BY updated_at DESC
      `, [sessionId]);
      
      console.log(`\n📁 Files in Session (${sessionFiles.length}):`);
      sessionFiles.forEach(file => {
        console.log(`  - ${file.filename} (${file.size} bytes) - Updated: ${file.updated_at}`);
      });
      
      return {
        session,
        files: sessionFiles
      };
      
    } catch (error) {
      console.error('❌ Error getting session details:', error.message);
      throw error;
    }
  }

  async getFileContent(sessionId, filename) {
    try {
      const [rows] = await this.connection.execute(`
        SELECT content, created_at, updated_at, LENGTH(content) as size
        FROM files 
        WHERE session_id = ? AND filename = ?
      `, [sessionId, filename]);
      
      if (rows.length === 0) {
        console.log(`❌ File not found: ${filename}`);
        return null;
      }
      
      const file = rows[0];
      console.log(`\n📄 FILE CONTENT: ${filename}`);
      console.log('='.repeat(50));
      console.log(`Size: ${file.size} bytes`);
      console.log(`Created: ${file.created_at}`);
      console.log(`Updated: ${file.updated_at}`);
      console.log('\nContent:');
      console.log('-'.repeat(30));
      
      // Convert buffer to string
      let content;
      if (Buffer.isBuffer(file.content)) {
        content = file.content.toString('utf8');
      } else {
        content = file.content;
      }
      
      console.log(content);
      console.log('-'.repeat(30));
      
      return {
        filename,
        content,
        size: file.size,
        created_at: file.created_at,
        updated_at: file.updated_at
      };
      
    } catch (error) {
      console.error('❌ Error getting file content:', error.message);
      throw error;
    }
  }

  async getRecentActivity(hours = 24) {
    try {
      console.log(`\n⏰ RECENT ACTIVITY (Last ${hours} hours)`);
      console.log('='.repeat(50));
      
      // Get recent file updates
      const [recentUpdates] = await this.connection.execute(`
        SELECT f.filename, f.session_id, f.updated_at, u.email
        FROM files f
        JOIN sessions s ON f.session_id = s.session_id
        JOIN users u ON s.user_id = u.id
        WHERE f.updated_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        ORDER BY f.updated_at DESC
        LIMIT 20
      `, [hours]);
      
      console.log(`📁 Recent File Updates (${recentUpdates.length}):`);
      recentUpdates.forEach(file => {
        console.log(`  - ${file.filename} by ${file.email} at ${file.updated_at}`);
      });
      
      // Get recent sessions
      const [recentSessions] = await this.connection.execute(`
        SELECT s.session_id, u.email, s.created_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        ORDER BY s.created_at DESC
        LIMIT 10
      `, [hours]);
      
      console.log(`\n🔑 Recent Sessions (${recentSessions.length}):`);
      recentSessions.forEach(session => {
        console.log(`  - ${session.email} created session ${session.session_id} at ${session.created_at}`);
      });
      
      return {
        recentUpdates,
        recentSessions
      };
      
    } catch (error) {
      console.error('❌ Error getting recent activity:', error.message);
      throw error;
    }
  }

  async searchFiles(searchTerm) {
    try {
      console.log(`\n🔍 SEARCHING FILES: "${searchTerm}"`);
      console.log('='.repeat(50));
      
      const [files] = await this.connection.execute(`
        SELECT f.filename, f.session_id, f.updated_at, LENGTH(f.content) as size, u.email
        FROM files f
        JOIN sessions s ON f.session_id = s.session_id
        JOIN users u ON s.user_id = u.id
        WHERE f.filename LIKE ?
        ORDER BY f.updated_at DESC
        LIMIT 20
      `, [`%${searchTerm}%`]);
      
      console.log(`📁 Found ${files.length} files matching "${searchTerm}":`);
      files.forEach(file => {
        console.log(`  - ${file.filename} (${file.size} bytes) by ${file.email} - Updated: ${file.updated_at}`);
      });
      
      return files;
      
    } catch (error) {
      console.error('❌ Error searching files:', error.message);
      throw error;
    }
  }

  async getBackendLogs() {
    try {
      console.log('\n📡 FETCHING BACKEND LOGS');
      console.log('='.repeat(50));
      
      const response = await fetch(`${BACKEND_URL}/logs`);
      
      if (response.ok) {
        const logs = await response.text();
        console.log('📋 Backend Logs:');
        console.log(logs);
        return logs;
      } else {
        console.log(`❌ Failed to fetch backend logs: ${response.status} ${response.statusText}`);
        return null;
      }
    } catch (error) {
      console.error('❌ Error fetching backend logs:', error.message);
      return null;
    }
  }

  async runComprehensiveLog() {
    try {
      console.log('🚀 STARTING COMPREHENSIVE LOGGING');
      console.log('='.repeat(60));
      
      // Connect to database
      const connected = await this.connect();
      if (!connected) {
        console.log('❌ Cannot proceed without database connection');
        return;
      }
      
      // Get database statistics
      await this.getDatabaseStats();
      
      // Get recent activity
      await this.getRecentActivity(24);
      
      // Get backend logs
      await this.getBackendLogs();
      
      console.log('\n✅ COMPREHENSIVE LOGGING COMPLETED');
      console.log('='.repeat(60));
      
    } catch (error) {
      console.error('❌ Comprehensive logging failed:', error);
    } finally {
      await this.disconnect();
    }
  }
}

// Export for use in other scripts
export default DatabaseLogger;

// If run directly, execute comprehensive logging
if (import.meta.url === `file://${process.argv[1]}`) {
  const logger = new DatabaseLogger();
  logger.runComprehensiveLog().catch(console.error);
}
