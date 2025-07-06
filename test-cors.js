const https = require('https');

// Função para fazer requisição HTTPS
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// Teste de CORS preflight
async function testCorsPreflight() {
  console.log('🔍 Testando CORS Preflight...');
  
  const options = {
    hostname: 'api.vmagenciadigital.com',
    port: 443,
    path: '/entregadoresquick/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://entregadoresquick.vmagenciadigital.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization',
      'User-Agent': 'CORS-Test-Script'
    }
  };
  
  try {
    const response = await makeRequest(options);
    console.log('✅ Status Code:', response.statusCode);
    console.log('✅ Headers CORS:');
    console.log('   Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('   Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
    console.log('   Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);
    console.log('   Access-Control-Allow-Credentials:', response.headers['access-control-allow-credentials']);
    
    if (response.statusCode === 200 || response.statusCode === 204) {
      console.log('✅ CORS Preflight funcionando corretamente!');
    } else {
      console.log('❌ CORS Preflight falhou!');
    }
  } catch (error) {
    console.error('❌ Erro no teste CORS:', error.message);
  }
}

// Teste de requisição POST
async function testPostRequest() {
  console.log('\n🔍 Testando requisição POST...');
  
  const postData = JSON.stringify({
    email: 'teste@teste.com',
    password: '123456'
  });
  
  const options = {
    hostname: 'api.vmagenciadigital.com',
    port: 443,
    path: '/entregadoresquick/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://entregadoresquick.vmagenciadigital.com',
      'User-Agent': 'CORS-Test-Script'
    }
  };
  
  try {
    const response = await makeRequest(options, postData);
    console.log('✅ Status Code:', response.statusCode);
    console.log('✅ Headers CORS:');
    console.log('   Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('   Access-Control-Allow-Credentials:', response.headers['access-control-allow-credentials']);
    
    if (response.statusCode === 401) {
      console.log('✅ Requisição POST funcionando (401 é esperado para credenciais inválidas)');
    } else {
      console.log('📄 Response Data:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro na requisição POST:', error.message);
  }
}

// Executar testes
async function runTests() {
  console.log('🚀 Iniciando testes de CORS...\n');
  
  await testCorsPreflight();
  await testPostRequest();
  
  console.log('\n✨ Testes concluídos!');
}

runTests(); 