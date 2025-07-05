require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery',
});

async function runMigrations() {
  console.log('🚀 Iniciando execução das migrações...');
  
  try {
    const connection = await pool.getConnection();
    
    try {
      // Ler o arquivo de migração
      const migrationPath = path.join(__dirname, 'migrations', 'simple_update.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Dividir o SQL em comandos individuais
      const commands = migrationSQL
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
      
      console.log(`📋 Executando ${commands.length} comandos SQL...`);
      
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        if (command.trim()) {
          try {
            await connection.query(command);
            console.log(`✅ Comando ${i + 1} executado com sucesso`);
          } catch (err) {
            // Se a tabela já existe, não é um erro
            if (err.code === 'ER_TABLE_EXISTS_ERROR') {
              console.log(`⚠️  Tabela já existe (comando ${i + 1})`);
            } else {
              console.error(`❌ Erro no comando ${i + 1}:`, err.message);
            }
          }
        }
      }
      
      console.log('🎉 Migrações executadas com sucesso!');
      
      // Verificar se as tabelas foram criadas
      const [tables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME IN ('notifications', 'user_notifications', 'user_notification_settings')
      `, [process.env.DB_NAME || 'food_flight_delivery']);
      
      console.log('📊 Tabelas criadas:');
      tables.forEach(table => {
        console.log(`  - ${table.TABLE_NAME}`);
      });
      
      // Verificar se há notificações de exemplo
      const [notifications] = await connection.query('SELECT COUNT(*) as count FROM notifications');
      console.log(`📨 Notificações de exemplo: ${notifications[0].count}`);
      
    } finally {
      connection.release();
    }
    
  } catch (err) {
    console.error('❌ Erro ao executar migrações:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations }; 