-- Criação das tabelas de notificações para o sistema de entregadores

-- Tabela principal de notificações
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type ENUM('ORDER', 'SYSTEM', 'PAYMENT', 'GENERAL') DEFAULT 'GENERAL',
  target_type ENUM('ALL', 'DELIVERY', 'ESTABLISHMENT', 'CUSTOMER') DEFAULT 'ALL',
  target_id INT NULL, -- ID específico do usuário/estabelecimento se target_type for específico
  action_url VARCHAR(500) NULL, -- URL para ação quando clicada
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
  expires_at TIMESTAMP NULL, -- Data de expiração da notificação
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_target_type (target_type),
  INDEX idx_type (type),
  INDEX idx_created_at (created_at),
  INDEX idx_expires_at (expires_at)
);

-- Tabela para rastrear interações dos usuários com notificações
CREATE TABLE IF NOT EXISTS user_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  notification_id INT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_notification (user_id, notification_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_notification_id (notification_id),
  INDEX idx_read (read),
  INDEX idx_clicked (clicked)
);

-- Tabela para configurações de notificação por usuário
CREATE TABLE IF NOT EXISTS user_notification_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_notifications BOOLEAN DEFAULT TRUE,
  system_notifications BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_settings (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Inserir algumas notificações de exemplo
INSERT INTO notifications (title, content, type, target_type, priority) VALUES
('Bem-vindo ao sistema!', 'Seu cadastro foi aprovado. Comece a receber pedidos agora!', 'SYSTEM', 'DELIVERY', 'HIGH'),
('Novo pedido disponível', 'Há um novo pedido disponível na sua área. Verifique o dashboard!', 'ORDER', 'DELIVERY', 'MEDIUM'),
('Pagamento recebido', 'Você recebeu R$ 15,00 pela entrega do pedido #1234', 'PAYMENT', 'DELIVERY', 'HIGH'),
('Manutenção programada', 'O sistema ficará indisponível das 02:00 às 04:00 para manutenção', 'SYSTEM', 'ALL', 'LOW');

-- Inserir configurações padrão para usuários existentes (se houver)
INSERT IGNORE INTO user_notification_settings (user_id)
SELECT id FROM users WHERE role = 'DELIVERY'; 