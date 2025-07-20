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

async function backupOrders() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Conectado com sucesso!');
    console.log('📦 Iniciando backup dos pedidos...');
    
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
    
    console.log('📥 Fazendo backup dos dados...');
    
    // Buscar todos os dados relacionados
    const [orders] = await connection.execute('SELECT * FROM orders ORDER BY id');
    const [offers] = await connection.execute('SELECT * FROM order_offers ORDER BY id');
    const [items] = await connection.execute('SELECT * FROM order_items ORDER BY id');
    const [acrescimos] = await connection.execute('SELECT * FROM order_item_acrescimo ORDER BY id');
    const [history] = await connection.execute('SELECT * FROM delivery_history ORDER BY id');
    const [logs] = await connection.execute('SELECT * FROM order_offer_logs ORDER BY id');
    const [notifications] = await connection.execute("SELECT * FROM notifications WHERE type IN ('order', 'delivery', 'offer') ORDER BY id");
    const [notificationSettings] = await connection.execute("SELECT * FROM user_notification_settings WHERE user_id IN (SELECT id FROM users WHERE role = 'DELIVERY') ORDER BY id");
    
    // Criar objeto de backup
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        database: dbConfig.database,
        host: dbConfig.host,
        totalOrders: orders.length,
        totalOffers: offers.length,
        totalItems: items.length,
        totalAcrescimos: acrescimos.length,
        totalHistory: history.length,
        totalLogs: logs.length,
        totalNotifications: notifications.length,
        totalNotificationSettings: notificationSettings.length
      },
      orders: orders,
      order_offers: offers,
      order_items: items,
      order_item_acrescimo: acrescimos,
      delivery_history: history,
      order_offer_logs: logs,
      notifications: notifications,
      user_notification_settings: notificationSettings
    };
    
    // Salvar backup
    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
    
    console.log('✅ Backup criado com sucesso!');
    console.log(`📁 Arquivo: ${backupFile}`);
    console.log(`📊 Tamanho: ${(backupData.orders.length + backupData.order_offers.length + backupData.order_items.length + backupData.order_item_acrescimo.length + backupData.delivery_history.length + backupData.order_offer_logs.length + backupData.notifications.length + backupData.user_notification_settings.length)} registros`);
    
    // Mostrar estatísticas
    console.log('\n📈 Estatísticas do backup:');
    console.log(`   - Pedidos: ${orders.length}`);
    console.log(`   - Ofertas: ${offers.length}`);
    console.log(`   - Itens: ${items.length}`);
    console.log(`   - Acréscimos: ${acrescimos.length}`);
    console.log(`   - Histórico: ${history.length}`);
    console.log(`   - Logs de ofertas: ${logs.length}`);
    console.log(`   - Notificações: ${notifications.length}`);
    console.log(`   - Configurações de notificações: ${notificationSettings.length}`);
    
    // Verificar se há pedidos recentes
    const recentOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      const now = new Date();
      const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 7; // Últimos 7 dias
    });
    
    if (recentOrders.length > 0) {
      console.log(`⚠️  ATENÇÃO: ${recentOrders.length} pedidos dos últimos 7 dias serão removidos!`);
    }
    
    console.log('\n💾 Backup salvo com sucesso!');
    console.log('📅 Data do backup:', new Date().toLocaleString('pt-BR'));
    
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
  backupOrders();
}

module.exports = { backupOrders }; 