const axios = require('axios');

async function testLogin() {
  try {
    console.log('🧪 Testando login...');
    
    const response = await axios.post('http://localhost:4000/login', {
      email: 'vitorapps4@gmail.com',
      password: '123456' // Senha padrão para teste
    });
    
    console.log('✅ Login bem-sucedido!');
    console.log('Token:', response.data.token ? 'Presente' : 'Ausente');
    console.log('User:', response.data.user);
    
    // Testar o endpoint /profile com o token
    const token = response.data.token;
    console.log('\n🔑 Token completo:', token);
    
    // Decodificar o token para verificar o conteúdo
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token);
    console.log('🔍 Token decodificado:', decoded);
    
    const profileResponse = await axios.get('http://localhost:4000/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Profile endpoint funcionando!');
    console.log('Profile data:', profileResponse.data);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

testLogin(); 