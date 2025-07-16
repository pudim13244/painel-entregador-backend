const axios = require('axios');

async function testEndpoints() {
  try {
    console.log('🧪 Testando endpoints...');
    
    // 1. Fazer login primeiro
    const loginResponse = await axios.post('http://localhost:4000/login', {
      email: 'vitorapps4@gmail.com',
      password: '123456'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login bem-sucedido, token obtido');
    
    // 2. Testar endpoint /profile
    console.log('\n📡 Testando /profile...');
    try {
      const profileResponse = await axios.get('http://localhost:4000/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ /profile funcionando:', profileResponse.data);
    } catch (error) {
      console.error('❌ /profile falhou:', error.response?.data || error.message);
    }
    
    // 3. Testar endpoint /orders/active
    console.log('\n📡 Testando /orders/active...');
    try {
      const activeOrdersResponse = await axios.get('http://localhost:4000/orders/active', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ /orders/active funcionando:', activeOrdersResponse.data);
    } catch (error) {
      console.error('❌ /orders/active falhou:', error.response?.data || error.message);
    }
    
    // 4. Testar endpoint /orders/history
    console.log('\n📡 Testando /orders/history...');
    try {
      const historyResponse = await axios.get('http://localhost:4000/orders/history', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ /orders/history funcionando:', historyResponse.data);
    } catch (error) {
      console.error('❌ /orders/history falhou:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error.response?.data || error.message);
  }
}

testEndpoints(); 