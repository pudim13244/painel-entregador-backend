const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery',
  timezone: '-03:00'
};

async function clearAllOrders() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Conectado com sucesso!');
    console.log('⚠️  ATENÇÃO: Este script irá APAGAR TODOS os pedidos do banco de dados!');
    console.log('📊 Verificando dados atuais...');
    
    // Verificar dados atuais
    const [ordersCount] = await connection.execute('SELECT COUNT(*) as count FROM orders');
    const [offersCount] = await connection.execute('SELECT COUNT(*) as count FROM order_offers');
    const [itemsCount] = await connection.execute('SELECT COUNT(*) as count FROM order_items');
    const [historyCount] = await connection.execute('SELECT COUNT(*) as count FROM delivery_history');
    const [logsCount] = await connection.execute('SELECT COUNT(*) as count FROM order_offer_logs');
    const [notificationsCount] = await connection.execute("SELECT COUNT(*) as count FROM notifications WHERE type IN ('order', 'delivery', 'offer')");
    const [settingsCount] = await connection.execute("SELECT COUNT(*) as count FROM user_notification_settings WHERE user_id IN (SELECT id FROM users WHERE role = 'DELIVERY')");
    
    console.log(`📋 Dados atuais:`);
    console.log(`   - Pedidos: ${ordersCount[0].count}`);
    console.log(`   - Ofertas: ${offersCount[0].count}`);
    console.log(`   - Itens de pedidos: ${itemsCount[0].count}`);
    console.log(`   - Histórico de entregas: ${historyCount[0].count}`);
    console.log(`   - Logs de ofertas: ${logsCount[0].count}`);
    console.log(`   - Notificações: ${notificationsCount[0].count}`);
    console.log(`   - Configurações de notificações: ${settingsCount[0].count}`);
    
    if (ordersCount[0].count === 0) {
      console.log('✅ Banco de dados já está limpo!');
      return;
    }
    
    console.log('\n❓ Deseja continuar? (Digite "SIM" para confirmar)');
    console.log('   Esta ação é IRREVERSÍVEL!');
    
    // Simular confirmação (em produção, você pode usar readline)
    const confirmacao = process.argv[2];
    if (confirmacao !== 'SIM') {
      console.log('❌ Operação cancelada. Para confirmar, execute: node clear_orders.js SIM');
      return;
    }
    
    console.log('\n🧹 Iniciando limpeza...');
    
    // Desabilitar verificação de chaves estrangeiras
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    // 1. Limpar ofertas de pedidos
    console.log('1️⃣ Limpando ofertas de pedidos...');
    await connection.execute('DELETE FROM order_offers WHERE 1=1');
    await connection.execute('ALTER TABLE order_offers AUTO_INCREMENT = 1');
    
    // 2. Limpar itens de pedidos
    console.log('2️⃣ Limpando itens de pedidos...');
    await connection.execute('DELETE FROM order_items');
    await connection.execute('ALTER TABLE order_items AUTO_INCREMENT = 1');
    
    // 3. Limpar acréscimos de itens
    console.log('3️⃣ Limpando acréscimos de itens...');
    await connection.execute('DELETE FROM order_item_acrescimo');
    await connection.execute('ALTER TABLE order_item_acrescimo AUTO_INCREMENT = 1');
    
    // 4. Limpar histórico de entregas
    console.log('4️⃣ Limpando histórico de entregas...');
    await connection.execute('DELETE FROM delivery_history');
    await connection.execute('ALTER TABLE delivery_history AUTO_INCREMENT = 1');
    
    // 5. Limpar logs de ofertas
    console.log('5️⃣ Limpando logs de ofertas...');
    await connection.execute('DELETE FROM order_offer_logs');
    await connection.execute('ALTER TABLE order_offer_logs AUTO_INCREMENT = 1');
    
    // 6. Limpar pedidos
    console.log('6️⃣ Limpando pedidos...');
    await connection.execute('DELETE FROM orders');
    await connection.execute('ALTER TABLE orders AUTO_INCREMENT = 1');
    
    // 7. Limpar notificações relacionadas
    console.log('7️⃣ Limpando notificações de pedidos...');
    await connection.execute("DELETE FROM notifications WHERE type IN ('order', 'delivery', 'offer')");
    
    // 8. Limpar configurações de notificações de usuários
    console.log('8️⃣ Limpando configurações de notificações...');
    await connection.execute("DELETE FROM user_notification_settings WHERE user_id IN (SELECT id FROM users WHERE role = 'DELIVERY')");
    
    // 9. Limpar movimentações de caixa
    console.log('9️⃣ Limpando movimentações de caixa...');
    await connection.execute("DELETE FROM movimentacoes_caixa WHERE tipo IN ('pedido', 'entrega', 'pagamento')");
    
    // 10. Limpar itens de venda PDV (comentado - coluna não existe)
    console.log('🔟 Pulando limpeza de itens de venda PDV (coluna pedido_id não existe)...');
    // await connection.execute('DELETE FROM itens_venda_pdv WHERE pedido_id IS NOT NULL');
    
    // Reabilitar verificação de chaves estrangeiras
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('\n✅ LIMPEZA CONCLUÍDA COM SUCESSO!');
    console.log('📊 Verificando resultado...');
    
    // Verificar resultado
    const [finalOrdersCount] = await connection.execute('SELECT COUNT(*) as count FROM orders');
    const [finalOffersCount] = await connection.execute('SELECT COUNT(*) as count FROM order_offers');
    const [finalItemsCount] = await connection.execute('SELECT COUNT(*) as count FROM order_items');
    const [finalHistoryCount] = await connection.execute('SELECT COUNT(*) as count FROM delivery_history');
    const [finalLogsCount] = await connection.execute('SELECT COUNT(*) as count FROM order_offer_logs');
    const [finalNotificationsCount] = await connection.execute("SELECT COUNT(*) as count FROM notifications WHERE type IN ('order', 'delivery', 'offer')");
    const [finalSettingsCount] = await connection.execute("SELECT COUNT(*) as count FROM user_notification_settings WHERE user_id IN (SELECT id FROM users WHERE role = 'DELIVERY')");
    
    console.log(`📋 Resultado final:`);
    console.log(`   - Pedidos: ${finalOrdersCount[0].count}`);
    console.log(`   - Ofertas: ${finalOffersCount[0].count}`);
    console.log(`   - Itens de pedidos: ${finalItemsCount[0].count}`);
    console.log(`   - Histórico de entregas: ${finalHistoryCount[0].count}`);
    console.log(`   - Logs de ofertas: ${finalLogsCount[0].count}`);
    console.log(`   - Notificações: ${finalNotificationsCount[0].count}`);
    console.log(`   - Configurações de notificações: ${finalSettingsCount[0].count}`);
    
    console.log('\n🎉 Banco de dados limpo com sucesso!');
    console.log('📅 Data da limpeza:', new Date().toLocaleString('pt-BR'));
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error.message);
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
  clearAllOrders();
}

module.exports = { clearAllOrders }; 