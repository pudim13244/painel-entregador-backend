require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'food_flight_delivery',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    port: 3306,
    ssl: false
  });

  try {
    console.log('Testando conexão com o banco de dados...');
    const connection = await pool.getConnection();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso!');
    
    // Testar uma query simples
    const [rows] = await connection.query('SELECT 1 as test');
    console.log('✅ Query de teste executada com sucesso:', rows);
    
    connection.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao conectar com o banco de dados:', err.message);
    console.error('Detalhes do erro:', err);
    process.exit(1);
  }
}

testConnection(); 