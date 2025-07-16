require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const mime = require('mime-types');
const webpush = require('web-push');
const cloudinary = require('cloudinary').v2;
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Middleware para tratar requisições OPTIONS (preflight)
app.options('*', cors());

// Configuração CORS para desenvolvimento e produção
const corsOptions = {
  origin: function (origin, callback) {
    // Lista de origens permitidas
    const allowedOrigins = [
      // Desenvolvimento local
      'http://localhost:8080',
      'http://localhost:8081',
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://localhost',
      'http://127.0.0.1',
      // Produção
      'https://entregadoresquick.vmagenciadigital.com',
      'https://www.entregadoresquick.vmagenciadigital.com'
    ];
    
    // Adicionar origens da variável de ambiente se existir
    if (process.env.CORS_ORIGINS) {
      const envOrigins = process.env.CORS_ORIGINS.split(',');
      allowedOrigins.push(...envOrigins);
    }
    
    // Log para debug
    console.log('Origem da requisição:', origin);
    console.log('Origens permitidas:', allowedOrigins);
    
    // Permitir requisições sem origem (ex: curl, Postman)
    if (!origin) {
      console.log('Requisição sem origem permitida');
      return callback(null, true);
    }
    
    // Verificar se a origem está na lista permitida
    if (allowedOrigins.includes(origin)) {
      console.log('Origem permitida:', origin);
      return callback(null, true);
    } else {
      console.log('Origem bloqueada pelo CORS:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200, // Para compatibilidade com alguns navegadores
  preflightContinue: false,
  maxAge: 86400 // Cache preflight por 24 horas
};

app.use(cors(corsOptions));

// Middleware adicional para garantir que OPTIONS seja tratado corretamente
app.use((req, res, next) => {
  // Forçar o origin local em desenvolvimento
  const devOrigin = 'http://localhost:5173';
  res.header('Access-Control-Allow-Origin', req.headers.origin || devOrigin);
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery',
});

// Sempre que conectar ao banco, define o timezone
async function setTimeZone() {
  try {
    await pool.query("SET time_zone = '-03:00'");
    console.log('[DB] Timezone definido para -03:00');
  } catch (err) {
    console.error('[DB] Erro ao definir timezone:', err);
  }
}

// Definir timezone ao iniciar
setTimeZone();
// Agendar para rodar a cada 3 horas
setInterval(setTimeZone, 3 * 60 * 60 * 1000);

// Garante timezone correto em toda nova conexão do pool
pool.on('connection', function (connection) {
  connection.query("SET time_zone = '-03:00'");
});

// Verifica e cria o campo phone se necessário
async function setupDatabase() {
  try {
    const connection = await pool.getConnection();
    try {
      // Verifica se a coluna phone existe
      const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'phone'
      `, [process.env.DB_NAME || 'food_flight_delivery']);

      // Se a coluna não existe, cria ela
      if (columns.length === 0) {
        await connection.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL');
        console.log('Campo phone adicionado com sucesso à tabela users');
      }

      // Verifica se a tabela delivery_profile existe
      const [tables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'delivery_profile'
      `, [process.env.DB_NAME || 'food_flight_delivery']);

      // Se a tabela não existe, cria ela
      if (tables.length === 0) {
        await connection.query(`
          CREATE TABLE delivery_profile (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            cpf VARCHAR(14) DEFAULT NULL,
            vehicle_type VARCHAR(50) DEFAULT NULL,
            vehicle_model VARCHAR(100) DEFAULT NULL,
            has_plate BOOLEAN DEFAULT FALSE,
            plate VARCHAR(10) DEFAULT NULL,
            photo_url TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
        console.log('Tabela delivery_profile criada com sucesso');
      }

      // Verifica se a tabela user_notification_settings existe
      const [notificationSettingsTables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'user_notification_settings'
      `, [process.env.DB_NAME || 'food_flight_delivery']);

      // Se a tabela não existe, cria ela
      if (notificationSettingsTables.length === 0) {
        await connection.query(`
          CREATE TABLE user_notification_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            order_notifications TINYINT(1) DEFAULT 1,
            system_notifications TINYINT(1) DEFAULT 1,
            payment_notifications TINYINT(1) DEFAULT 1,
            push_notifications TINYINT(1) DEFAULT 1,
            email_notifications TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY user_id (user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
        console.log('Tabela user_notification_settings criada com sucesso');
      }

      // Verifica se a tabela order_offers existe
      const [orderOffersTables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'order_offers'
      `, [process.env.DB_NAME || 'food_flight_delivery']);

      // Se a tabela não existe, cria ela
      if (orderOffersTables.length === 0) {
        await connection.query(`
          CREATE TABLE order_offers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            deliveryman_id INT NOT NULL,
            status ENUM('pending','accepted','rejected','expired') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_order_id (order_id),
            KEY idx_deliveryman_id (deliveryman_id),
            KEY idx_status (status),
            KEY idx_created_at (created_at),
            UNIQUE KEY unique_order_deliveryman (order_id, deliveryman_id)
          )
        `);
        console.log('Tabela order_offers criada com sucesso');
      }
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Erro ao configurar banco de dados:', err);
  }
}

// Chama a função de setup ao iniciar o servidor
setupDatabase();

const jwtSecret = process.env.JWT_SECRET || 'segredo_super_secreto';

// Middleware de autenticação JWT
function authenticateDelivery(req, res, next) {
  console.log('🔐 [AUTH] ===== INÍCIO DO MIDDLEWARE =====');
  console.log('🔐 [AUTH] Middleware chamado para:', req.method, req.originalUrl);
  console.log('🔐 [AUTH] URL completa:', req.url);
  console.log('🔐 [AUTH] Headers recebidos:', req.headers);
  console.log('🔐 [AUTH] Authorization header:', req.headers['authorization']);
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.log('❌ [AUTH] Header Authorization não encontrado');
    return res.status(401).json({ message: 'Token não fornecido' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log('❌ [AUTH] Token não encontrado no header');
    return res.status(401).json({ message: 'Token não fornecido' });
  }
  console.log('🔑 [AUTH] Token recebido:', token.substring(0, 20) + '...');
  try {
    const decoded = jwt.verify(token, jwtSecret);
    console.log('✅ [AUTH] Token decodificado:', decoded);
    req.user = decoded;
    if (req.user.role !== 'DELIVERY') {
      console.log('❌ [AUTH] Usuário não é entregador:', req.user.role);
      return res.status(401).json({ message: 'Acesso negado' });
    }
    console.log('✅ [AUTH] Autenticação bem-sucedida para usuário:', req.user.id);
    next();
  } catch (err) {
    console.log('❌ [AUTH] Erro ao verificar token:', err.message);
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
}

// Login do entregador
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND role = "DELIVERY"', [email]);
    if (rows.length === 0) return res.status(401).json({ message: 'Entregador não encontrado' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Senha incorreta' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Registro de entregador
app.post('/register', async (req, res) => {
  const { name, email, password, phone, cpf, address } = req.body;
  
  try {
    // Validações básicas
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: 'Nome, email e senha são obrigatórios' 
      });
    }

    // Validar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Formato de email inválido' 
      });
    }

    // Validar senha (mínimo 6 caracteres)
    if (password.length < 6) {
      return res.status(400).json({ 
        message: 'A senha deve ter pelo menos 6 caracteres' 
      });
    }

    // Verificar se o email já existe
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE email = ?', 
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        message: 'Este email já está cadastrado' 
      });
    }

    // Hash da senha
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Inserir novo usuário entregador
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, phone, cpfCnpj, address, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, phone || null, cpf || null, address || null, 'DELIVERY', 'active']
    );

    const userId = result.insertId;

    // Criar perfil de entregador
    await pool.query(
      'INSERT INTO delivery_profile (user_id) VALUES (?)',
      [userId]
    );

    // Criar configurações de notificação padrão
    await pool.query(
      'INSERT INTO user_notification_settings (user_id) VALUES (?)',
      [userId]
    );

    // Gerar token JWT
    const token = jwt.sign(
      { id: userId, email: email, role: 'DELIVERY' }, 
      jwtSecret, 
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Entregador cadastrado com sucesso!',
      token,
      user: {
        id: userId,
        name,
        email,
        role: 'DELIVERY'
      }
    });

  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ 
      message: 'Erro interno do servidor ao cadastrar entregador' 
    });
  }
});

// Endpoint para retornar perfil do entregador autenticado
app.get('/profile', authenticateDelivery, async (req, res) => {
  console.log('📡 [PROFILE] Endpoint /profile chamado - ANTES do middleware');
  console.log('📡 [PROFILE] Headers da requisição:', req.headers);
  console.log('📡 [PROFILE] Método:', req.method);
  console.log('📡 [PROFILE] URL:', req.originalUrl);
  const deliveryPersonId = req.user.id;
  try {
    // Busca dados do usuário
    const [users] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ? AND role = "DELIVERY"', [deliveryPersonId]);
    if (users.length === 0) return res.status(404).json({ message: 'Entregador não encontrado' });
    const user = users[0];
    
    // Busca dados do perfil
    const [profiles] = await pool.query('SELECT cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    const profile = profiles[0] || {};
    
    // Busca dados de entregas (sem rating por enquanto)
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as totalDeliveries
      FROM delivery_history 
      WHERE delivery_id = ? AND finished_at IS NOT NULL
    `, [deliveryPersonId]);
    
    const result = {
      ...user,
      ...profile,
      rating: 0, // Rating não implementado ainda
      totalDeliveries: stats[0]?.totalDeliveries || 0
    };
    
    console.log('✅ [PROFILE] Dados retornados:', result);
    res.json(result);
  } catch (err) {
    console.error('❌ [PROFILE] Erro ao buscar perfil:', err);
    res.status(500).json({ message: 'Erro ao buscar perfil do entregador', error: err.message });
  }
});

// Endpoint para atualizar perfil do entregador
app.put('/profile', authenticateDelivery, async (req, res) => {
  const deliveryPersonId = req.user.id;
  const { name, email, cpf, phone, vehicle_type, vehicle_model, has_plate, plate, photo_url } = req.body;
  
  try {
    // Atualizar dados do usuário
    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, email, phone, deliveryPersonId]
    );
    
    // Verificar se já existe perfil
    const [existingProfile] = await pool.query('SELECT id FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    
    if (existingProfile.length > 0) {
      // Atualizar perfil existente
      await pool.query(
        'UPDATE delivery_profile SET cpf = ?, vehicle_type = ?, vehicle_model = ?, has_plate = ?, plate = ?, photo_url = ? WHERE user_id = ?',
        [cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url, deliveryPersonId]
      );
    } else {
      // Criar novo perfil
      await pool.query(
        'INSERT INTO delivery_profile (user_id, cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [deliveryPersonId, cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url]
      );
    }
    
    // Retornar dados atualizados
    const [users] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ?', [deliveryPersonId]);
    const [profiles] = await pool.query('SELECT cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    const profile = profiles[0] || {};
    
    res.json({ ...users[0], ...profile });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ message: 'Erro ao atualizar perfil do entregador', error: err.message });
  }
});

// Listar pedidos disponíveis para entrega
app.get('/orders/available', authenticateDelivery, async (req, res) => {
  try {
    let [orders] = await pool.query(`
      SELECT 
        o.id AS pedido_id,
        o.status,
        o.created_at AS data,
        u.name AS cliente,
        u.phone AS telefone,
        u.address AS endereco,
        ep.restaurant_name AS estabelecimento
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      WHERE o.status = 'READY' AND (o.delivery_id IS NULL OR o.delivery_id = 0)
      ORDER BY o.created_at ASC
    `);
    // Filtro: não mostrar pedidos de consumo local ou endereço LOCAL
    orders = orders.filter(order =>
      order.cliente?.toUpperCase() !== 'CONSUMO LOCAL' &&
      order.endereco?.toUpperCase() !== 'LOCAL'
    );
    res.json(orders);
  } catch (err) {
    console.error('Erro SQL /orders/available:', err);
    res.status(500).json({ message: 'Erro ao buscar pedidos disponíveis', error: err.message });
  }
});

// Listar pedidos em andamento do entregador
app.get('/orders/active', authenticateDelivery, async (req, res) => {
  console.log('📡 [ACTIVE] Endpoint /orders/active chamado');
  const deliveryPersonId = req.user.id;
  try {
    const [orders] = await pool.query(`
      SELECT o.id, o.status, o.created_at, u.address AS endereco, o.customer_id, u.name as customer_name, u.phone as customer_phone, o.establishment_id, ep.restaurant_name as establishment_name, o.total_amount AS value, o.payment_method
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      WHERE o.delivery_id = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED')
      ORDER BY o.created_at ASC
    `, [deliveryPersonId]);
    console.log('✅ [ACTIVE] Pedidos encontrados:', orders.length);
    res.json(orders);
  } catch (err) {
    console.error('❌ [ACTIVE] Erro SQL /orders/active:', err);
    res.status(500).json({ message: 'Erro ao buscar pedidos em andamento', error: err.message });
  }
});

// Histórico de entregas finalizadas
app.get('/orders/history', authenticateDelivery, async (req, res) => {
  console.log('📡 [HISTORY] Endpoint /orders/history chamado');
  const deliveryPersonId = req.user.id;
  try {
    const [orders] = await pool.query(`
      SELECT 
        o.id,
        o.created_at AS date,
        ep.restaurant_name AS restaurant,
        u.name AS customer,
        o.total_amount AS value,
        o.delivery_fee AS earning,
        5 AS rating -- mock, ajuste se tiver avaliação real
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      WHERE o.status = 'DELIVERED' AND o.delivery_id = ?
      ORDER BY o.created_at DESC
    `, [deliveryPersonId]);
    console.log('✅ [HISTORY] Pedidos encontrados:', orders.length);
    res.json(orders);
  } catch (err) {
    console.error('❌ [HISTORY] Erro SQL /orders/history:', err);
    res.status(500).json({ message: 'Erro ao buscar histórico de entregas', error: err.message });
  }
});

// Aceitar pedido para entrega
app.post('/orders/:id/accept', authenticateDelivery, async (req, res) => {
  const orderId = req.params.id;
  const deliveryPersonId = req.user.id;
  try {
    // Verifica se o pedido está disponível
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND status = "READY" AND (delivery_id IS NULL OR delivery_id = 0)', [orderId]);
    if (orders.length === 0) return res.status(400).json({ message: 'Pedido não disponível para entrega' });
    // Atualiza o pedido para o entregador
    await pool.query('UPDATE orders SET delivery_id = ?, status = "DELIVERING" WHERE id = ?', [deliveryPersonId, orderId]);
    res.json({ message: 'Pedido aceito com sucesso' });
  } catch (err) {
    console.error('Erro SQL /orders/:id/accept:', err);
    res.status(500).json({ message: 'Erro ao aceitar pedido', error: err.message });
  }
});

// Finalizar entrega
app.post('/orders/:id/finish', authenticateDelivery, async (req, res) => {
  const orderId = req.params.id;
  const deliveryPersonId = req.user.id;
  try {
    // Verifica se o pedido pertence ao entregador e está em entrega
    const [orders] = await pool.query('SELECT * FROM orders WHERE id = ? AND delivery_id = ? AND status = "DELIVERING"', [orderId, deliveryPersonId]);
    if (orders.length === 0) return res.status(403).json({ message: 'Pedido não pertence a este entregador ou não está em entrega' });
    await pool.query('UPDATE orders SET status = "DELIVERED" WHERE id = ?', [orderId]);

    // Buscar dados completos do pedido para preencher o histórico
    const [orderData] = await pool.query(`
      SELECT o.id as order_id, o.establishment_id, ep.restaurant_name as establishment_name, o.delivery_id, u.name as delivery_name, o.customer_id, c.name as customer_name, c.phone as customer_phone, o.delivery_address, o.total_amount, o.delivery_fee, o.created_at, o.payment_method
      FROM orders o
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      JOIN users u ON o.delivery_id = u.id
      JOIN users c ON o.customer_id = c.id
      WHERE o.id = ?
    `, [orderId]);
    const order = orderData[0];

    // Buscar horário do MySQL (timezone correto)
    const [[{ now: finishedAt }]] = await pool.query("SELECT NOW() as now");

    // Verifica se já existe registro no histórico
    const [historyRows] = await pool.query('SELECT * FROM delivery_history WHERE order_id = ?', [orderId]);
    if (historyRows.length === 0) {
      // Inserir novo registro
      await pool.query(
        `INSERT INTO delivery_history (order_id, establishment_id, establishment_name, delivery_id, delivery_name, customer_name, customer_phone, delivery_address, total_amount, delivery_fee, created_at, payment_method, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        , [order.order_id, order.establishment_id, order.establishment_name, order.delivery_id, order.delivery_name, order.customer_name, order.customer_phone, order.delivery_address, order.total_amount, order.delivery_fee, order.created_at, order.payment_method, finishedAt]
      );
    } else {
      // Atualizar apenas campos faltantes
      const updateFields = [];
      const updateValues = [];
      const row = historyRows[0];
      if (!row.establishment_id) { updateFields.push('establishment_id = ?'); updateValues.push(order.establishment_id); }
      if (!row.establishment_name) { updateFields.push('establishment_name = ?'); updateValues.push(order.establishment_name); }
      if (!row.delivery_id) { updateFields.push('delivery_id = ?'); updateValues.push(order.delivery_id); }
      if (!row.delivery_name) { updateFields.push('delivery_name = ?'); updateValues.push(order.delivery_name); }
      if (!row.customer_name) { updateFields.push('customer_name = ?'); updateValues.push(order.customer_name); }
      if (!row.customer_phone) { updateFields.push('customer_phone = ?'); updateValues.push(order.customer_phone); }
      if (!row.delivery_address) { updateFields.push('delivery_address = ?'); updateValues.push(order.delivery_address); }
      if (!row.total_amount) { updateFields.push('total_amount = ?'); updateValues.push(order.total_amount); }
      if (!row.delivery_fee) { updateFields.push('delivery_fee = ?'); updateValues.push(order.delivery_fee); }
      if (!row.created_at) { updateFields.push('created_at = ?'); updateValues.push(order.created_at); }
      if (!row.payment_method) { updateFields.push('payment_method = ?'); updateValues.push(order.payment_method); }
      if (!row.finished_at) { updateFields.push('finished_at = ?'); updateValues.push(finishedAt); }
      if (updateFields.length > 0) {
        await pool.query(
          `UPDATE delivery_history SET ${updateFields.join(', ')} WHERE order_id = ?`,
          [...updateValues, orderId]
        );
      }
    }
    res.json({ message: 'Pedido finalizado com sucesso!' });
  } catch (err) {
    console.error('/orders/:id/finish erro:', err);
    res.status(500).json({ message: 'Erro ao finalizar pedido' });
  }
});

// Buscar detalhes de um pedido específico
app.get('/orders/:id', authenticateDelivery, async (req, res) => {
  const orderId = req.params.id;
  try {
    // Busca o pedido principal
    const [orders] = await pool.query(`
      SELECT 
        o.id,
        o.status,
        o.created_at AS data,
        o.total_amount AS value,
        o.delivery_fee AS earning,
        u.name AS customerName,
        u.phone AS customerPhone,
        u.address AS customerAddress,
        ep.restaurant_name AS restaurant,
        eu.address AS restaurantAddress
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      JOIN users eu ON o.establishment_id = eu.id AND eu.role = 'ESTABLISHMENT'
      WHERE o.id = ?
    `, [orderId]);
    if (orders.length === 0) return res.status(404).json({ message: 'Pedido não encontrado' });
    const order = orders[0];
    // Busca os itens do pedido
    const [items] = await pool.query(
      `SELECT CONCAT(oi.quantity, "x ", p.name) AS item
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    order.items = items.map(i => i.item);
    res.json(order);
  } catch (err) {
    console.error('Erro SQL /orders/:id:', err);
    res.status(500).json({ message: 'Erro ao buscar detalhes do pedido', error: err.message });
  }
});

// Pasta de uploads
const uploadDir = path.join(__dirname, 'uploads', 'photos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gera nome único: timestamp + originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'photo_' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Rota para upload de foto
app.post('/upload/photo', authenticateDelivery, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo enviado' });
  }
  // Caminho relativo para salvar no banco
  const relativePath = path.join('uploads', 'photos', req.file.filename).replace(/\\/g, '/');
  res.json({ path: relativePath });
});

// Função para autenticar com a conta de serviço
function getDriveService() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// Rota para upload no Google Drive
app.post('/upload/photo-drive', authenticateDelivery, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhum arquivo enviado' });
  }
  try {
    const drive = getDriveService();
    const fileMetadata = {
      name: req.file.originalname,
      parents: ['root'], // ou coloque o ID de uma pasta específica do seu Drive
    };
    const media = {
      mimeType: mime.lookup(req.file.originalname) || 'image/jpeg',
      body: fs.createReadStream(req.file.path),
    };
    // Faz upload
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    const fileId = file.data.id;

    // Torna o arquivo público
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Gera o link público
    const publicUrl = `https://drive.google.com/uc?id=${fileId}`;

    // Remove o arquivo local após upload
    fs.unlinkSync(req.file.path);

    res.json({ url: publicUrl, fileId });
  } catch (err) {
    console.error('Erro ao enviar para o Google Drive:', err);
    res.status(500).json({ message: 'Erro ao enviar para o Google Drive', error: err.message });
  }
});

// Servir arquivos estáticos de uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Chaves VAPID geradas anteriormente
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:manoelvitor253@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Salvar subscription
app.post('/push/subscribe', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;
  const subscription = req.body.subscription;
  if (!subscription) return res.status(400).json({ message: 'Subscription obrigatória' });
  try {
    // Verifica se já existe para esse user
    const [rows] = await pool.query('SELECT id FROM push_subscriptions WHERE user_id = ? AND subscription = ?', [userId, JSON.stringify(subscription)]);
    if (rows.length === 0) {
      await pool.query('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)', [userId, JSON.stringify(subscription)]);
    }
    res.json({ message: 'Subscription salva com sucesso' });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao salvar subscription', error: err.message });
  }
});

// Enviar notificação push para todos os inscritos ou para um user_id
app.post('/push/send', async (req, res) => {
  const { title, body, user_id } = req.body;
  try {
    let query = 'SELECT subscription FROM push_subscriptions';
    let params = [];
    if (user_id) {
      query += ' WHERE user_id = ?';
      params.push(user_id);
    }
    const [rows] = await pool.query(query, params);
    const payload = JSON.stringify({
      title: title || 'Notificação',
      body: body || 'Você tem uma nova notificação!'
    });
    console.log('Push subscriptions encontrados:', rows.length);
    console.log('Payload enviado:', payload);
    let success = 0, fail = 0;
    for (const row of rows) {
      try {
        console.log('Enviando push para subscription:', row.subscription);
        await webpush.sendNotification(JSON.parse(row.subscription), payload);
        success++;
      } catch (err) {
        fail++;
        console.error('Erro ao enviar push:', err);
      }
    }
    res.json({ message: `Notificações enviadas: ${success}, falharam: ${fail}` });
  } catch (err) {
    console.error('Erro ao enviar notificações:', err);
    res.status(500).json({ message: 'Erro ao enviar notificações', error: err.message });
  }
});

// Rota para obter a chave pública VAPID (para o frontend)
app.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Configuração Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Endpoint para upload de foto de perfil
app.post('/upload/profile-photo', authenticateDelivery, multer().single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Arquivo não enviado' });

    const userId = req.user.id;

    // Upload para Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'profile_photos' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Salvar a URL no banco de dados
    const photoUrl = result.secure_url;
    
    // Verificar se o perfil existe
    const [profiles] = await pool.query('SELECT id FROM delivery_profile WHERE user_id = ?', [userId]);
    
    if (profiles.length === 0) {
      // Criar novo perfil com a foto
      await pool.query(
        'INSERT INTO delivery_profile (user_id, photo_url) VALUES (?, ?)',
        [userId, photoUrl]
      );
    } else {
      // Atualizar perfil existente com a nova foto
      await pool.query(
        'UPDATE delivery_profile SET photo_url = ? WHERE user_id = ?',
        [photoUrl, userId]
      );
    }

    res.json({ url: photoUrl });
  } catch (err) {
    console.error('Erro ao enviar foto:', err);
    res.status(500).json({ message: 'Erro ao enviar foto', error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Mapa de conexões por entregador
const entregadorSockets = new Map();

io.on('connection', (socket) => {
  // Recebe o id do entregador ao conectar
  socket.on('registrar_entregador', (entregadorId) => {
    entregadorSockets.set(entregadorId, socket.id);
    socket.entregadorId = entregadorId;
    console.log(`[WebSocket] Entregador conectado: ${entregadorId} (socket: ${socket.id})`);
  });
  socket.on('disconnect', () => {
    if (socket.entregadorId) {
      entregadorSockets.delete(socket.entregadorId);
      console.log(`[WebSocket] Entregador desconectado: ${socket.entregadorId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`QuickEntregadores - Backend rodando na porta ${PORT}`);
}); 

// ===== SISTEMA DE NOTIFICAÇÕES =====

// Buscar notificações do usuário
app.get('/notifications', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, unread_only = false } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = `WHERE (n.target_type = 'ALL' OR n.target_type = 'DELIVERY')`;
    let params = [userId];
    
    if (unread_only === 'true') {
      whereClause += ` AND (un.\`read\` IS NULL OR un.\`read\` = 0)`;
    }

    const [rows] = await pool.query(`
      SELECT 
        n.*,
        un.\`read\`,
        un.clicked,
        un.read_at,
        un.clicked_at,
        CASE 
          WHEN un.\`read\` IS NULL OR un.\`read\` = 0 THEN 0
          ELSE 1
        END as is_read
      FROM notifications n
      LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = ?
      ${whereClause}
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Buscar total de notificações não lidas
    const [unreadCount] = await pool.query(`
      SELECT COUNT(*) as count
      FROM notifications n
      LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = ?
      WHERE (n.target_type = 'ALL' OR n.target_type = 'DELIVERY')
      AND (un.\`read\` IS NULL OR un.\`read\` = 0)
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
    `, [userId]);

    res.json({
      notifications: rows,
      unread_count: unreadCount[0].count,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: rows.length
      }
    });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res.status(500).json({ message: 'Erro ao buscar notificações', error: err.message });
  }
});

// Contar notificações não lidas
app.get('/notifications/unread-count', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;

  try {
    const [result] = await pool.query(`
      SELECT COUNT(*) as count
      FROM notifications n
      LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = ?
      WHERE (n.target_type = 'ALL' OR n.target_type = 'DELIVERY')
      AND (un.\`read\` IS NULL OR un.\`read\` = 0)
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
    `, [userId]);

    res.json({ unread_count: result[0].count });
  } catch (err) {
    console.error('Erro ao contar notificações não lidas:', err);
    res.status(500).json({ message: 'Erro ao contar notificações', error: err.message });
  }
});

// Marcar todas as notificações como lidas
app.post('/notifications/mark-all-read', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;

  try {
    // Buscar todas as notificações não lidas do usuário
    const [notifications] = await pool.query(`
      SELECT n.id
      FROM notifications n
      LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = ?
      WHERE (n.target_type = 'ALL' OR n.target_type = 'DELIVERY')
      AND (un.\`read\` IS NULL OR un.\`read\` = 0)
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
    `, [userId]);

    // Marcar cada uma como lida
    for (const notification of notifications) {
      await pool.query(`
        INSERT INTO user_notifications (user_id, notification_id, \`read\`, read_at)
        VALUES (?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE \`read\` = 1, read_at = NOW()
      `, [userId, notification.id]);
    }

    res.json({ 
      message: 'Todas as notificações foram marcadas como lidas',
      marked_count: notifications.length
    });
  } catch (err) {
    console.error('Erro ao marcar todas as notificações como lidas:', err);
    res.status(500).json({ message: 'Erro ao marcar notificações como lidas', error: err.message });
  }
});

// Buscar configurações de notificação do usuário
app.get('/notifications/settings', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;

  try {
    const [settings] = await pool.query(`
      SELECT * FROM user_notification_settings WHERE user_id = ?
    `, [userId]);

    if (settings.length === 0) {
      // Criar configurações padrão se não existirem
      await pool.query(`
        INSERT INTO user_notification_settings (user_id) VALUES (?)
      `, [userId]);
      
      res.json({
        order_notifications: true,
        system_notifications: true,
        payment_notifications: true,
        push_notifications: true,
        email_notifications: false
      });
    } else {
      res.json(settings[0]);
    }
  } catch (err) {
    console.error('Erro ao buscar configurações de notificação:', err);
    res.status(500).json({ message: 'Erro ao buscar configurações', error: err.message });
  }
});

// Atualizar configurações de notificação
app.put('/notifications/settings', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;
  const { order_notifications, system_notifications, payment_notifications, push_notifications, email_notifications } = req.body;

  try {
    await pool.query(`
      INSERT INTO user_notification_settings 
        (user_id, order_notifications, system_notifications, payment_notifications, push_notifications, email_notifications)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        order_notifications = VALUES(order_notifications),
        system_notifications = VALUES(system_notifications),
        payment_notifications = VALUES(payment_notifications),
        push_notifications = VALUES(push_notifications),
        email_notifications = VALUES(email_notifications)
    `, [userId, order_notifications, system_notifications, payment_notifications, push_notifications, email_notifications]);

    res.json({ message: 'Configurações atualizadas com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar configurações de notificação:', err);
    res.status(500).json({ message: 'Erro ao atualizar configurações', error: err.message });
  }
});

// Marcar notificação como lida
app.post('/notifications/:id/read', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  try {
    console.log('Marcando notificação como lida:', { userId, notificationId });
    await pool.query(`
      INSERT INTO user_notifications (user_id, notification_id, \`read\`, read_at)
      VALUES (?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE \`read\` = 1, read_at = NOW()
    `, [userId, notificationId]);
    console.log('Query executada com sucesso para marcar como lida');
    res.json({ message: 'Notificação marcada como lida' });
  } catch (err) {
    console.error('Erro ao marcar notificação como lida:', err);
    res.status(500).json({ message: 'Erro ao marcar notificação como lida', error: err.message });
  }
});

// Marcar notificação como clicada
app.post('/notifications/:id/click', authenticateDelivery, async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  try {
    console.log('Marcando notificação como clicada:', { userId, notificationId });
    await pool.query(`
      INSERT INTO user_notifications (user_id, notification_id, \`clicked\`, clicked_at)
      VALUES (?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE \`clicked\` = 1, clicked_at = NOW()
    `, [userId, notificationId]);
    console.log('Query executada com sucesso para marcar como clicada');
    res.json({ message: 'Notificação marcada como clicada' });
  } catch (err) {
    console.error('Erro ao marcar notificação como clicada:', err);
    res.status(500).json({ message: 'Erro ao marcar notificação como clicada', error: err.message });
  }
});

// ===== SISTEMA DE DISTRIBUIÇÃO AUTOMÁTICA DE PEDIDOS =====

// Buscar ofertas de pedidos para o entregador
app.get('/order-offers', authenticateDelivery, async (req, res) => {
  const deliverymanId = req.user.id;

  try {
    const [offers] = await pool.query(`
      SELECT 
        oo.id as offer_id,
        oo.order_id,
        oo.status,
        oo.created_at,
        o.id as pedido_id,
        o.status as order_status,
        o.created_at as order_created_at,
        u.name AS cliente,
        u.phone AS telefone,
        u.address AS endereco,
        ep.restaurant_name AS estabelecimento
      FROM order_offers oo
      JOIN orders o ON oo.order_id = o.id
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      WHERE oo.deliveryman_id = ? 
      AND oo.status = 'pending'
      AND oo.created_at > DATE_SUB(NOW(), INTERVAL 20 SECOND)
      ORDER BY oo.created_at DESC
    `, [deliverymanId]);

    res.json(offers);
  } catch (err) {
    console.error('Erro ao buscar ofertas de pedidos:', err);
    res.status(500).json({ message: 'Erro ao buscar ofertas', error: err.message });
  }
});

// Aceitar oferta de pedido
app.post('/order-offers/:id/accept', authenticateDelivery, async (req, res) => {
  const deliverymanId = req.user.id;
  const offerId = req.params.id;

  try {
    // Verificar se a oferta existe e é válida
    const [offers] = await pool.query(`
      SELECT oo.*, o.status as order_status 
      FROM order_offers oo
      JOIN orders o ON oo.order_id = o.id
      WHERE oo.id = ? AND oo.deliveryman_id = ? AND oo.status = 'pending'
    `, [offerId, deliverymanId]);

    if (offers.length === 0) {
      return res.status(404).json({ message: 'Oferta não encontrada ou já expirada' });
    }

    const offer = offers[0];

    // Verificar se o pedido ainda está disponível
    if (offer.order_status !== 'READY') {
      await pool.query('UPDATE order_offers SET status = ? WHERE id = ?', ['expired', offerId]);
      return res.status(400).json({ message: 'Pedido não está mais disponível' });
    }

    // Marcar oferta como aceita
    await pool.query('UPDATE order_offers SET status = ? WHERE id = ?', ['accepted', offerId]);

    // Atribuir pedido ao entregador e mudar status para DELIVERING
    await pool.query('UPDATE orders SET delivery_id = ?, status = "DELIVERING" WHERE id = ?', [deliverymanId, offer.order_id]);

    // Marcar outras ofertas do mesmo pedido como expiradas
    await pool.query('UPDATE order_offers SET status = ? WHERE order_id = ? AND id != ?', ['expired', offer.order_id, offerId]);

    res.json({ 
      message: 'Pedido aceito com sucesso',
      order_id: offer.order_id
    });
  } catch (err) {
    console.error('Erro ao aceitar oferta:', err);
    res.status(500).json({ message: 'Erro ao aceitar oferta', error: err.message });
  }
});

// Rejeitar oferta de pedido
app.post('/order-offers/:id/reject', authenticateDelivery, async (req, res) => {
  const deliverymanId = req.user.id;
  const offerId = req.params.id;

  try {
    await pool.query('UPDATE order_offers SET status = ? WHERE id = ? AND deliveryman_id = ?', ['rejected', offerId, deliverymanId]);
    
    res.json({ message: 'Oferta rejeitada' });
  } catch (err) {
    console.error('Erro ao rejeitar oferta:', err);
    res.status(500).json({ message: 'Erro ao rejeitar oferta', error: err.message });
  }
});

// Função para distribuir pedidos automaticamente
async function distributeOrders() {
  try {
    const dbName = process.env.DB_NAME || 'food_flight_delivery';
    console.log(`[distributeOrders] Usando banco: ${dbName}`);

    // Buscar pedidos prontos que não têm entregador atribuído
    const [readyOrders] = await pool.query(`
      SELECT 
        o.id,
        o.customer_id,
        o.establishment_id,
        o.status,
        o.delivery_id,
        ep.restaurant_name,
        u.name as customer_name,
        u.address
      FROM orders o
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      JOIN users u ON o.customer_id = u.id
      WHERE o.status = 'READY' 
      AND (o.delivery_id IS NULL OR o.delivery_id = 0)
    `);
    console.log(`[distributeOrders] Pedidos prontos encontrados: ${readyOrders.length}`);
    if (readyOrders.length === 0) {
      console.log(`[distributeOrders] ⏭️ Nenhum pedido pronto encontrado - saindo da função`);
      return;
    }

    // Buscar todos os entregadores disponíveis
    const [deliverymen] = await pool.query(`
      SELECT u.id, u.name
      FROM users u
      WHERE u.role = 'DELIVERY'
    `);
    if (deliverymen.length === 0) {
      console.log(`[distributeOrders] ❌ ERRO: Nenhum entregador disponível no sistema`);
      return;
    }

    // Embaralhar pedidos e entregadores para garantir aleatoriedade
    function shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }
    const shuffledOrders = shuffle([...readyOrders]);
    const shuffledDeliverymen = shuffle([...deliverymen]);

    // Para cada pedido, buscar entregadores que ainda não receberam oferta
    let deliverymenQueue = [...shuffledDeliverymen];
    for (const order of shuffledOrders) {
      // Buscar IDs dos entregadores que já receberam oferta para este pedido
      const [alreadyOffered] = await pool.query(`
        SELECT deliveryman_id FROM order_offers
        WHERE order_id = ? AND status IN ('pending', 'expired', 'accepted', 'rejected')
      `, [order.id]);
      const alreadyOfferedIds = alreadyOffered.map(o => o.deliveryman_id);

      // Filtrar entregadores que ainda não receberam oferta para este pedido
      let availableDeliverymen = deliverymenQueue.filter(d => !alreadyOfferedIds.includes(d.id));
      if (availableDeliverymen.length === 0) {
        // Todos já receberam, limpa ofertas para recomeçar o ciclo
        console.log(`[distributeOrders] Todos os entregadores já receberam oferta para o pedido ${order.id}. Limpando ofertas para recomeçar o ciclo.`);
        await pool.query(`DELETE FROM order_offers WHERE order_id = ?`, [order.id]);
        // Resetar fila para todos entregadores
        availableDeliverymen = [...deliverymenQueue];
      }
      if (availableDeliverymen.length === 0) continue; // Nenhum disponível

      // Selecionar o primeiro da fila para este pedido
      const selected = availableDeliverymen[0];
      // Remover esse entregador da fila para não receber outro pedido nesta rodada
      deliverymenQueue = deliverymenQueue.filter(d => d.id !== selected.id);

      // Criar oferta para o entregador
      await criarOferta(order, selected);

      console.log(`[distributeOrders] ✅ OFERTA CRIADA: Pedido ${order.id} (${order.restaurant_name} -> ${order.customer_name}) para entregador ${selected.name} (ID: ${selected.id})`);

      // Se a fila de entregadores esvaziou, reinicia para próxima rodada
      if (deliverymenQueue.length === 0) {
        deliverymenQueue = [...shuffledDeliverymen];
      }
    }
  } catch (err) {
    console.error('Erro na distribuição automática de pedidos:', err);
  }
}

// Função para limpar ofertas expiradas usando hora local
async function cleanupExpiredOffers() {
  try {
    const now = Date.now();
    // Buscar ofertas pendentes
    const [offers] = await pool.query(`SELECT id, created_at FROM order_offers WHERE status = 'pending'`);
    const expiredIds = offers.filter(o => (now - new Date(o.created_at).getTime()) > 20000).map(o => o.id);
    if (expiredIds.length > 0) {
      console.log(`[cleanupExpiredOffers] Excluindo ofertas expiradas:`, expiredIds);
      await pool.query('DELETE FROM order_offers WHERE id IN (?)', [expiredIds]);
    }
  } catch (err) {
    console.error('[cleanupExpiredOffers] Erro ao excluir ofertas expiradas:', err);
  }
}

// Função para mostrar ofertas ativas
async function showActiveOffers() {
  try {
    const [activeOffers] = await pool.query(`
      SELECT 
        oo.id,
        oo.order_id,
        oo.deliveryman_id,
        oo.status,
        oo.created_at,
        u.name as deliveryman_name,
        ep.restaurant_name,
        c.name as customer_name
      FROM order_offers oo
      JOIN users u ON oo.deliveryman_id = u.id
      JOIN orders o ON oo.order_id = o.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      JOIN users c ON o.customer_id = c.id
      WHERE oo.status = 'pending'
      ORDER BY oo.created_at DESC
    `);
    
    if (activeOffers.length > 0) {
      console.log(`[showActiveOffers] Ofertas ativas no sistema:`);
      activeOffers.forEach(offer => {
        console.log(`[showActiveOffers] Oferta ID: ${offer.id}, Pedido: ${offer.order_id} (${offer.restaurant_name} -> ${offer.customer_name}), Entregador: ${offer.deliveryman_name} (ID: ${offer.deliveryman_id}), Criada: ${offer.created_at}`);
      });
    } else {
      console.log(`[showActiveOffers] Nenhuma oferta ativa no sistema`);
    }
  } catch (err) {
    console.error('Erro ao mostrar ofertas ativas:', err);
  }
}

// Função para limpar ofertas antigas e duplicadas
async function cleanupOldOffers() {
  try {
    // Limpar ofertas expiradas com mais de 1 hora
    const [result] = await pool.query(`
      DELETE FROM order_offers 
      WHERE status = 'expired' 
      AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `);
    
    if (result.affectedRows > 0) {
      console.log(`[cleanupOldOffers] Limpeza: ${result.affectedRows} ofertas antigas removidas`);
    }
    
    // Limpar ofertas duplicadas (manter apenas a mais recente)
    const [duplicateResult] = await pool.query(`
      DELETE oo1 FROM order_offers oo1
      INNER JOIN order_offers oo2 
      WHERE oo1.id < oo2.id 
      AND oo1.order_id = oo2.order_id 
      AND oo1.deliveryman_id = oo2.deliveryman_id 
      AND oo1.status = oo2.status
      AND oo1.status = 'expired'
    `);
    
    if (duplicateResult.affectedRows > 0) {
      console.log(`[cleanupOldOffers] Limpeza: ${duplicateResult.affectedRows} ofertas duplicadas removidas`);
    }
  } catch (err) {
    console.error('Erro ao limpar ofertas antigas:', err);
  }
}

// Função para criar oferta para entregador, usando hora local
async function criarOferta(order, selected) {
  const now = Date.now();
  const createdAt = new Date(now).toISOString().slice(0, 19).replace('T', ' '); // formato MySQL DATETIME
  // Criar oferta para o entregador
  const [result] = await pool.query(`
    INSERT INTO order_offers (order_id, deliveryman_id, status, created_at)
    VALUES (?, ?, 'pending', ?)
  `, [order.id, selected.id, createdAt]);
  const offerId = result.insertId;
  // Logar no banco o tempo de expiração da oferta
  await pool.query(`
    INSERT INTO order_offer_logs (offer_id, order_id, deliveryman_id, expires_in_seconds)
    VALUES (?, ?, ?, 20)
  `, [offerId, order.id, selected.id]);
  // Log detalhado no console
  const nowStr = new Date(now).toISOString();
  console.log(`[LOG OFERTA] ${nowStr} | Oferta criada: offer_id=${offerId}, pedido_id=${order.id}, entregador_id=${selected.id} (${selected.name}), expira_em=20s`);
}

// Iniciar jobs de distribuição automática
setInterval(distributeOrders, 5000); // Executar a cada 5 segundos
setInterval(cleanupExpiredOffers, 30000); // Limpar ofertas expiradas a cada 30 segundos
setInterval(showActiveOffers, 60000); // Mostrar ofertas ativas a cada 60 segundos
setInterval(cleanupOldOffers, 300000); // Limpar ofertas antigas a cada 5 minutos

// Função para limpar ofertas expiradas e aceitas a cada 2 segundos
async function cleanupOffersEvery2Seconds() {
  try {
    const now = Date.now();
    
    // Buscar ofertas pendentes para verificar expiração
    const [pendingOffers] = await pool.query(`SELECT id, created_at FROM order_offers WHERE status = 'pending'`);
    const expiredIds = pendingOffers.filter(o => (now - new Date(o.created_at).getTime()) > 20000).map(o => o.id);
    
    // Buscar ofertas aceitas para limpar
    const [acceptedOffers] = await pool.query(`SELECT id FROM order_offers WHERE status = 'accepted'`);
    const acceptedIds = acceptedOffers.map(o => o.id);
    
    // Combinar IDs para deletar
    const idsToDelete = [...expiredIds, ...acceptedIds];
    
    if (idsToDelete.length > 0) {
      console.log(`[cleanupOffersEvery2Seconds] Excluindo ofertas: ${expiredIds.length} expiradas, ${acceptedIds.length} aceitas`);
      await pool.query('DELETE FROM order_offers WHERE id IN (?)', [idsToDelete]);
    }
  } catch (err) {
    console.error('[cleanupOffersEvery2Seconds] Erro ao limpar ofertas:', err);
  }
}

// Executar limpeza a cada 2 segundos
setInterval(cleanupOffersEvery2Seconds, 2000);

console.log('Sistema de distribuição automática de pedidos iniciado');

// Loga a hora do servidor na inicialização
console.log('[BOOT] Backend iniciado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), '| Timestamp:', Date.now());

// Loga a hora do servidor a cada 40 minutos
setInterval(() => {
  const now = new Date();
  console.log('[LOG HORA]', now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), '| Timestamp:', now.getTime());
}, 40 * 60 * 1000);

// Criar tabela de log de ofertas se não existir
async function ensureOrderOfferLogsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_offer_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      offer_id INT,
      order_id INT,
      deliveryman_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_in_seconds INT
    )
  `);
}
ensureOrderOfferLogsTable();

// Novo endpoint: Histórico de entregas do entregador logado
app.get('/delivery-history', authenticateDelivery, async (req, res) => {
  const deliveryPersonId = req.user.id;
  try {
    const [rows] = await pool.query(`
      SELECT * FROM delivery_history WHERE delivery_id = ?
    `, [deliveryPersonId]);
    // Converter campos numéricos para número
    const history = rows.map(row => ({
      ...row,
      delivery_fee: row.delivery_fee ? Number(row.delivery_fee) : 0,
      total_amount: row.total_amount ? Number(row.total_amount) : 0,
      created_at: row.created_at,
      finished_at: row.finished_at
    }));
    res.json(history);
  } catch (err) {
    console.error('Erro ao buscar delivery_history:', err);
    res.status(500).json({ message: 'Erro ao buscar histórico de entregas', error: err.message });
  }
});

// Endpoint para faturamento total do dia e por estabelecimento
app.get('/daily-earnings', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Buscar todos os registros do dia na tabela delivery_history
    const [rows] = await pool.query(`
      SELECT establishment_id, establishment_name, total_amount, delivery_fee, finished_at
      FROM delivery_history
      WHERE DATE(finished_at) = ?
    `, [date]);

    // Calcular totais gerais
    let total_amount = 0;
    let total_delivery_fee = 0;
    const establishments = {};

    for (const row of rows) {
      const estId = row.establishment_id;
      const estName = row.establishment_name;
      const amount = Number(row.total_amount) || 0;
      const fee = Number(row.delivery_fee) || 0;
      total_amount += amount;
      total_delivery_fee += fee;
      if (!establishments[estId]) {
        establishments[estId] = {
          establishment_id: estId,
          establishment_name: estName,
          total_amount: 0,
          total_delivery_fee: 0,
          total_orders: 0
        };
      }
      establishments[estId].total_amount += amount;
      establishments[estId].total_delivery_fee += fee;
      establishments[estId].total_orders += 1;
    }

    res.json({
      total_amount,
      total_delivery_fee,
      establishments: Object.values(establishments)
    });
  } catch (err) {
    console.error('/daily-earnings error:', err);
    res.status(500).json({ message: 'Erro ao buscar faturamento do dia' });
  }
});

// Endpoint para faturamento total em um intervalo de datas
app.get('/earnings-range', async (req, res) => {
  try {
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Parâmetros start_date e end_date são obrigatórios (YYYY-MM-DD)' });
    }
    // Validar intervalo máximo de 31 dias
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) {
      return res.status(400).json({ message: 'A data inicial deve ser menor ou igual à data final.' });
    }
    if (diff > 30) {
      return res.status(400).json({ message: 'O intervalo máximo permitido é de 31 dias.' });
    }
    // Buscar todos os registros do período na tabela delivery_history
    const [rows] = await pool.query(`
      SELECT establishment_id, establishment_name, total_amount, delivery_fee, finished_at
      FROM delivery_history
      WHERE DATE(finished_at) BETWEEN ? AND ?
    `, [startDate, endDate]);

    // Calcular totais gerais
    let total_amount = 0;
    let total_delivery_fee = 0;
    const establishments = {};

    for (const row of rows) {
      const estId = row.establishment_id;
      const estName = row.establishment_name;
      const amount = Number(row.total_amount) || 0;
      const fee = Number(row.delivery_fee) || 0;
      total_amount += amount;
      total_delivery_fee += fee;
      if (!establishments[estId]) {
        establishments[estId] = {
          establishment_id: estId,
          establishment_name: estName,
          total_amount: 0,
          total_delivery_fee: 0,
          total_orders: 0
        };
      }
      establishments[estId].total_amount += amount;
      establishments[estId].total_delivery_fee += fee;
      establishments[estId].total_orders += 1;
    }

    res.json({
      total_amount,
      total_delivery_fee,
      establishments: Object.values(establishments)
    });
  } catch (err) {
    console.error('/earnings-range error:', err);
    res.status(500).json({ message: 'Erro ao buscar faturamento do período' });
  }
});



// Endpoint para listar estabelecimentos (pode ser público)
app.get('/establishments', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT u.id, ep.restaurant_name as name
      FROM users u
      INNER JOIN establishment_profile ep ON u.id = ep.user_id
      WHERE u.role = 'ESTABLISHMENT' AND u.status = 'active'
      ORDER BY ep.restaurant_name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar estabelecimentos' });
  }
});

// Listar pedidos do histórico para recebimento (recebidos ou não recebidos)
app.get('/recebimentos/pedidos', authenticateDelivery, async (req, res) => {
  const deliveryId = req.user.id;
  const { status, estabelecimento_id, q } = req.query;
  let where = 'delivery_id = ?';
  let params = [deliveryId];
  if (status === 'recebido') {
    where += ' AND taxa_recebida = 1';
  } else if (status === 'nao-recebido') {
    where += ' AND taxa_recebida = 0';
  }
  if (estabelecimento_id) {
    where += ' AND establishment_id = ?';
    params.push(estabelecimento_id);
  }
  if (q) {
    where += ' AND (order_id LIKE ? OR customer_name LIKE ? OR DATE(finished_at) = ?)';
    params.push(`%${q}%`, `%${q}%`, q);
  }
  try {
    const [pedidosRows] = await pool.query(
      `SELECT id, order_id, establishment_id, customer_name, delivery_fee, taxa_recebida, finished_at FROM delivery_history WHERE ${where} ORDER BY finished_at DESC`,
      params
    );
    res.json(pedidosRows);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao buscar pedidos', error: err.message });
  }
});

// Criar solicitação de recebimento
app.post('/recebimentos/solicitar', authenticateDelivery, async (req, res) => {
  const deliveryId = req.user.id;
  const { pedidos_ids } = req.body; // array de IDs do delivery_history
  if (!Array.isArray(pedidos_ids) || pedidos_ids.length === 0) {
    return res.status(400).json({ message: 'Selecione ao menos um pedido' });
  }
  try {
    // Buscar os pedidos e somar o valor das taxas
    const [pedidos] = await pool.query(
      `SELECT id, delivery_fee FROM delivery_history WHERE id IN (${pedidos_ids.map(() => '?').join(',')}) AND delivery_id = ? AND taxa_recebida = 0`,
      [...pedidos_ids, deliveryId]
    );
    if (pedidos.length !== pedidos_ids.length) {
      return res.status(400).json({ message: 'Alguns pedidos não encontrados ou já recebidos' });
    }
    const total = pedidos.reduce((sum, p) => sum + Number(p.delivery_fee), 0);
    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Inserir recebimento
    const [insertResult] = await pool.query(
      `INSERT INTO recebimentos (delivery_id, total, status, codigo_confirmacao, pedidos_ids) VALUES (?, ?, 'pendente', ?, ?)`,
      [deliveryId, total, codigo, JSON.stringify(pedidos_ids)]
    );
    res.json({ id: insertResult.insertId, total, codigo, status: 'pendente' });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao solicitar recebimento', error: err.message });
  }
});

// Confirmar recebimento
app.post('/recebimentos/confirmar', authenticateDelivery, async (req, res) => {
  const deliveryId = req.user.id;
  const { recebimento_id, codigo } = req.body;
  if (!recebimento_id || !codigo) {
    return res.status(400).json({ message: 'ID do recebimento e código são obrigatórios' });
  }
  try {
    // Buscar recebimento
    const [recebimentoRows] = await pool.query(
      `SELECT * FROM recebimentos WHERE id = ? AND delivery_id = ? AND status = 'pendente'`,
      [recebimento_id, deliveryId]
    );
    if (!recebimentoRows.length) {
      return res.status(404).json({ message: 'Solicitação não encontrada ou já confirmada' });
    }
    const recebimento = recebimentoRows[0];
    if (recebimento.codigo_confirmacao !== codigo) {
      return res.status(400).json({ message: 'Código de confirmação inválido' });
    }
    // Atualizar status do recebimento
    await pool.query(
      `UPDATE recebimentos SET status = 'confirmado' WHERE id = ?`,
      [recebimento_id]
    );
    // Marcar pedidos como recebidos
    const pedidos_ids = JSON.parse(recebimento.pedidos_ids);
    await pool.query(
      `UPDATE delivery_history SET taxa_recebida = 1 WHERE id IN (${pedidos_ids.map(() => '?').join(',')})`,
      pedidos_ids
    );
    res.json({ status: 'confirmado' });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao confirmar recebimento', error: err.message });
  }
});
