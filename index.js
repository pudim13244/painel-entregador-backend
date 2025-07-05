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

const app = express();
app.use(express.json());

// Configuração CORS mais permissiva para desenvolvimento
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
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
      'http://127.0.0.1'
    ];
    if (!origin) return callback(null, true); // Permite requisições sem origem (ex: curl)
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log('Origem bloqueada pelo CORS:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'food_flight_delivery',
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

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware de autenticação para entregador
function authenticateDelivery(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token não fornecido' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    if (user.role !== 'DELIVERY') return res.status(403).json({ message: 'Acesso restrito a entregadores' });
    req.user = user;
    next();
  });
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
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
});

// Perfil do entregador autenticado (GET e PUT)
app.get('/profile', authenticateDelivery, async (req, res) => {
  const deliveryPersonId = req.user.id;
  try {
    // Busca dados do usuário
    const [users] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ? AND role = "DELIVERY"', [deliveryPersonId]);
    if (users.length === 0) return res.status(404).json({ message: 'Entregador não encontrado' });
    const user = users[0];
    // Busca dados do perfil
    const [profiles] = await pool.query('SELECT cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    const profile = profiles[0] || {};
    res.json({ ...user, ...profile });
  } catch (err) {
    console.error('Erro ao buscar perfil:', err);
    res.status(500).json({ message: 'Erro ao buscar perfil do entregador', error: err.message });
  }
});

app.put('/profile', authenticateDelivery, async (req, res) => {
  const deliveryPersonId = req.user.id;
  const { name, email, cpf, phone, vehicle_type, vehicle_model, has_plate, plate, photo_url } = req.body;
  try {
    // Atualiza dados básicos do usuário
    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, email, phone, deliveryPersonId]
    );

    // Verifica se já existe perfil
    const [profiles] = await pool.query('SELECT id FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    if (profiles.length === 0) {
      // Cria novo perfil
      await pool.query(
        'INSERT INTO delivery_profile (user_id, cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [deliveryPersonId, cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url]
      );
    } else {
      // Atualiza perfil existente
      await pool.query(
        'UPDATE delivery_profile SET cpf = ?, vehicle_type = ?, vehicle_model = ?, has_plate = ?, plate = ?, photo_url = ? WHERE user_id = ?',
        [cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url, deliveryPersonId]
      );
    }

    // Busca dados atualizados para retornar
    const [users] = await pool.query('SELECT id, name, email, phone FROM users WHERE id = ?', [deliveryPersonId]);
    const [updatedProfile] = await pool.query('SELECT cpf, vehicle_type, vehicle_model, has_plate, plate, photo_url FROM delivery_profile WHERE user_id = ?', [deliveryPersonId]);
    
    res.json({ 
      ...users[0], 
      ...(updatedProfile[0] || {})
    });
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
  const deliveryPersonId = req.user.id;
  try {
    const [orders] = await pool.query(`
      SELECT o.id, o.status, o.created_at, u.address AS endereco, o.customer_id, u.name as customer_name, u.phone as customer_phone, o.establishment_id, ep.restaurant_name as establishment_name
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      JOIN establishment_profile ep ON o.establishment_id = ep.user_id
      WHERE o.delivery_id = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED')
      ORDER BY o.created_at ASC
    `, [deliveryPersonId]);
    res.json(orders);
  } catch (err) {
    console.error('Erro SQL /orders/active:', err);
    res.status(500).json({ message: 'Erro ao buscar pedidos em andamento', error: err.message });
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
    res.json({ message: 'Entrega finalizada com sucesso' });
  } catch (err) {
    console.error('Erro SQL /orders/:id/finish:', err);
    res.status(500).json({ message: 'Erro ao finalizar entrega', error: err.message });
  }
});

// Histórico de entregas finalizadas
app.get('/orders/history', authenticateDelivery, async (req, res) => {
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
    res.json(orders);
  } catch (err) {
    console.error('Erro SQL /orders/history:', err);
    res.status(500).json({ message: 'Erro ao buscar histórico de entregas', error: err.message });
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

    // Upload para Cloudinary
    const result = await cloudinary.uploader.upload_stream(
      { folder: 'profile_photos' },
      (error, result) => {
        if (error) return res.status(500).json({ message: 'Erro no upload', error });
        return res.json({ url: result.secure_url });
      }
    );
    // Enviar o buffer da imagem
    result.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ message: 'Erro ao enviar foto', error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
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
      AND oo.created_at > DATE_SUB(NOW(), INTERVAL 5 SECOND)
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

    // Atribuir pedido ao entregador
    await pool.query('UPDATE orders SET delivery_id = ? WHERE id = ?', [deliverymanId, offer.order_id]);

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
      AND u.name NOT LIKE '%CONSUMO LOCAL%'
      AND u.address NOT LIKE '%LOCAL%'
      AND NOT EXISTS (
        SELECT 1 FROM order_offers oo 
        WHERE oo.order_id = o.id 
        AND oo.status IN ('pending', 'accepted')
      )
    `);
    console.log(`[distributeOrders] Pedidos prontos encontrados: ${readyOrders.length}`);
    if (readyOrders.length > 0) {
      readyOrders.forEach(o => {
        console.log(`[distributeOrders] Pedido ID: ${o.id}, status: ${o.status}, delivery_id: ${o.delivery_id}`);
      });
    }
    if (readyOrders.length === 0) {
      return; // Nenhum pedido pronto para distribuir
    }

    // Buscar entregadores disponíveis ordenados por número de entregas
    const [deliverymen] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        COUNT(o.id) as active_deliveries
      FROM users u
      LEFT JOIN orders o ON u.id = o.delivery_id AND o.status IN ('IN_DELIVERY', 'PICKED_UP')
      WHERE u.role = 'DELIVERY'
      GROUP BY u.id, u.name
      ORDER BY active_deliveries ASC
    `);

    if (deliverymen.length === 0) {
      return; // Nenhum entregador disponível
    }

    // Distribuir cada pedido
    for (const order of readyOrders) {
      let offered = false;
      
      // Tentar oferecer para cada entregador na ordem
      for (const deliveryman of deliverymen) {
        // Verificar se já existe oferta pendente para este pedido/entregador
        const [existingOffers] = await pool.query(`
          SELECT id FROM order_offers 
          WHERE order_id = ? AND deliveryman_id = ? AND status = 'pending'
        `, [order.id, deliveryman.id]);

        if (existingOffers.length > 0) {
          continue; // Já existe oferta pendente
        }

        // Criar oferta para este entregador
        await pool.query(`
          INSERT INTO order_offers (order_id, deliveryman_id, status) 
          VALUES (?, ?, 'pending')
        `, [order.id, deliveryman.id]);

        console.log(`Oferta criada: Pedido ${order.id} para entregador ${deliveryman.name} (ID: ${deliveryman.id})`);
        offered = true;
        break; // Sair do loop de entregadores para este pedido
      }

      if (!offered) {
        console.log(`Não foi possível oferecer o pedido ${order.id} - nenhum entregador disponível`);
      }
    }
  } catch (err) {
    console.error('Erro na distribuição automática de pedidos:', err);
  }
}

// Limpar ofertas expiradas (mais de 5 segundos)
async function cleanupExpiredOffers() {
  try {
    const [result] = await pool.query(`
      UPDATE order_offers 
      SET status = 'expired' 
      WHERE status = 'pending' 
      AND created_at < DATE_SUB(NOW(), INTERVAL 5 SECOND)
    `);
    
    if (result.affectedRows > 0) {
      console.log(`Limpeza: ${result.affectedRows} ofertas expiradas removidas`);
    }
  } catch (err) {
    console.error('Erro ao limpar ofertas expiradas:', err);
  }
}

// Iniciar jobs de distribuição automática
setInterval(distributeOrders, 2000); // Executar a cada 2 segundos
setInterval(cleanupExpiredOffers, 1000); // Limpar ofertas expiradas a cada 1 segundo

console.log('Sistema de distribuição automática de pedidos iniciado');
