const { clearAllOrders } = require('./clear_orders');

async function clearOnly() {
  console.log('🧹 INICIANDO LIMPEZA DIRETA DO BANCO DE DADOS');
  console.log('=' .repeat(60));
  console.log('⚠️  ATENÇÃO: Este script irá APAGAR TODOS os pedidos SEM backup!');
  console.log('⚠️  Use apenas se tiver certeza absoluta!');
  console.log('=' .repeat(60));
  
  try {
    const confirmacao = process.argv[2];
    if (confirmacao !== 'SIM') {
      console.log('\n❌ Operação cancelada.');
      console.log('💡 Para executar a limpeza, use:');
      console.log('   node clear_only.js SIM');
      return;
    }
    
    console.log('\n🧹 Iniciando limpeza direta...');
    await clearAllOrders();
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 LIMPEZA CONCLUÍDA COM SUCESSO!');
    console.log('🧹 Banco de dados limpo');
    console.log('📅 Data:', new Date().toLocaleString('pt-BR'));
    
  } catch (error) {
    console.error('\n❌ Erro durante a limpeza:', error.message);
    console.error('🔍 Detalhes:', error);
  }
}

// Executar script
if (require.main === module) {
  clearOnly();
}

module.exports = { clearOnly }; 