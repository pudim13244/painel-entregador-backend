const { backupOrdersOptimized } = require('./backup_orders_optimized');
const { clearAllOrders } = require('./clear_orders');

async function cleanDatabaseWithBackup() {
  console.log('🚀 INICIANDO PROCESSO DE LIMPEZA DO BANCO DE DADOS');
  console.log('=' .repeat(60));
  
  try {
    // 1. Fazer backup primeiro
    console.log('\n📦 PASSO 1: Fazendo backup otimizado dos dados...');
    await backupOrdersOptimized();
    
    console.log('\n' + '=' .repeat(60));
    
    // 2. Perguntar se quer continuar
    console.log('\n❓ Deseja continuar com a limpeza?');
    console.log('   Esta ação é IRREVERSÍVEL!');
    console.log('   Para confirmar, execute: node clean_database.js SIM');
    
    const confirmacao = process.argv[2];
    if (confirmacao !== 'SIM') {
      console.log('\n❌ Operação cancelada.');
      console.log('💡 Para executar a limpeza completa, use:');
      console.log('   node clean_database.js SIM');
      return;
    }
    
    console.log('\n🧹 PASSO 2: Iniciando limpeza...');
    await clearAllOrders();
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 PROCESSO CONCLUÍDO COM SUCESSO!');
    console.log('📊 Backup salvo na pasta /backups/');
    console.log('🧹 Banco de dados limpo');
    console.log('📅 Data:', new Date().toLocaleString('pt-BR'));
    
  } catch (error) {
    console.error('\n❌ Erro durante o processo:', error.message);
    console.error('🔍 Detalhes:', error);
  }
}

// Executar script
if (require.main === module) {
  cleanDatabaseWithBackup();
}

module.exports = { cleanDatabaseWithBackup }; 