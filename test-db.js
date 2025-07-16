require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery'
});

async function testDatabase() {
  try {
    console.log('Testando estrutura da tabela delivery_history...');
    console.log('Configurações do banco:', {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      database: process.env.DB_NAME || 'food_flight_delivery'
    });
    
    // Verificar estrutura da tabela
    const [structure] = await pool.query('DESCRIBE delivery_history');
    console.log('Estrutura da tabela delivery_history:');
    console.log(structure);
    
    // Verificar se o campo taxa_recebida existe
    const hasTaxaRecebida = structure.some(col => col.Field === 'taxa_recebida');
    console.log('\nCampo taxa_recebida existe:', hasTaxaRecebida);
    
    // Verificar dados na tabela
    const [data] = await pool.query('SELECT COUNT(*) as total FROM delivery_history');
    console.log('\nTotal de registros na tabela delivery_history:', data[0].total);
    
    // Verificar alguns registros de exemplo
    const [sample] = await pool.query('SELECT * FROM delivery_history LIMIT 3');
    console.log('\nExemplos de registros:');
    console.log(sample);
    
    // Verificar tabela recebimentos
    console.log('\nVerificando tabela recebimentos...');
    const [recebimentosStructure] = await pool.query('DESCRIBE recebimentos');
    console.log('Estrutura da tabela recebimentos:');
    console.log(recebimentosStructure);
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await pool.end();
  }
}

testDatabase(); 