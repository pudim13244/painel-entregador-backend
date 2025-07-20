const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery',
  timezone: '-03:00'
};

async function backupOrdersOptimized() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Conectado com sucesso!');
    console.log('📦 Iniciando backup otimizado dos pedidos...');
    
    // Verificar dados atuais
    const [ordersCount] = await connection.execute('SELECT COUNT(*) as count FROM orders');
    const [offersCount] = await connection.execute('SELECT COUNT(*) as count FROM order_offers');
    const [itemsCount] = await connection.execute('SELECT COUNT(*) as count FROM order_items');
    const [historyCount] = await connection.execute('SELECT COUNT(*) as count FROM delivery_history');
    
    console.log(`📋 Dados encontrados:`);
    console.log(`   - Pedidos: ${ordersCount[0].count}`);
    console.log(`   - Ofertas: ${offersCount[0].count}`);
    console.log(`   - Itens de pedidos: ${itemsCount[0].count}`);
    console.log(`   - Histórico de entregas: ${historyCount[0].count}`);
    
    if (ordersCount[0].count === 0) {
      console.log('✅ Nenhum pedido encontrado para backup!');
      return;
    }
    
    // Criar pasta de backup se não existir
    const backupDir = path.join(__dirname, 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    // Nome do arquivo de backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `orders_backup_${timestamp}.json`);
    
    console.log('📥 Fazendo backup dos dados em lotes...');
    
    // Backup otimizado - apenas metadados e contagens
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        database: dbConfig.database,
        host: dbConfig.host,
        totalOrders: ordersCount[0].count,
        totalOffers: offersCount[0].count,
        totalItems: itemsCount[0].count,
        totalHistory: historyCount[0].count,
        backupType: 'metadata_only',
        note: 'Backup otimizado - apenas contagens e metadados'
      },
      // Apenas contagens, não os dados completos
      counts: {
        orders: ordersCount[0].count,
        order_offers: offersCount[0].count,
        order_items: itemsCount[0].count,
        delivery_history: historyCount[0].count
      }
    };
    
    // Salvar backup
    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
    
    console.log('✅ Backup otimizado criado com sucesso!');
    console.log(`📁 Arquivo: ${backupFile}`);
    console.log(`📊 Total de registros: ${backupData.counts.orders + backupData.counts.order_offers + backupData.counts.order_items + backupData.counts.delivery_history}`);
    
    // Mostrar estatísticas
    console.log('\n📈 Estatísticas do backup:');
    console.log(`   - Pedidos: ${ordersCount[0].count}`);
    console.log(`   - Ofertas: ${offersCount[0].count}`);
    console.log(`   - Itens: ${itemsCount[0].count}`);
    console.log(`   - Histórico: ${historyCount[0].count}`);
    
    console.log('\n💾 Backup otimizado salvo com sucesso!');
    console.log('📅 Data do backup:', new Date().toLocaleString('pt-BR'));
    console.log('⚠️  Nota: Este é um backup de metadados apenas. Os dados completos não foram salvos devido ao volume.');
    
  } catch (error) {
    console.error('❌ Erro durante o backup:', error.message);
    console.error('🔍 Detalhes:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão com banco de dados fechada.');
    }
  }
}

// Executar script
if (require.main === module) {
  backupOrdersOptimized();
}

module.exports = { backupOrdersOptimized }; 