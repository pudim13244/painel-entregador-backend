-- Atualização da estrutura de notificações para compatibilidade com o sistema

-- Adicionar campos que faltam na tabela notifications
ALTER TABLE notifications 
ADD COLUMN type ENUM('ORDER', 'SYSTEM', 'PAYMENT', 'GENERAL') DEFAULT 'GENERAL' AFTER content,
ADD COLUMN priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM' AFTER type,
ADD COLUMN action_url VARCHAR(500) NULL AFTER priority,
ADD COLUMN expires_at TIMESTAMP NULL AFTER action_url,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Adicionar índices para melhor performance
ALTER TABLE notifications 
ADD INDEX idx_type (type),
ADD INDEX idx_priority (priority),
ADD INDEX idx_created_at (created_at),
ADD INDEX idx_expires_at (expires_at);

-- Criar tabela de configurações de notificação
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

-- Atualizar notificações existentes com tipos apropriados
UPDATE notifications SET 
  type = 'SYSTEM',
  priority = 'MEDIUM'
WHERE id = 1;

UPDATE notifications SET 
  type = 'GENERAL',
  priority = 'LOW'
WHERE id = 4;

-- Inserir configurações padrão para usuários entregadores existentes
INSERT IGNORE INTO user_notification_settings (user_id)
SELECT id FROM users WHERE role = 'DELIVERY'; 

ALTER TABLE delivery_history ADD COLUMN taxa_recebida TINYINT(1) NOT NULL DEFAULT 0; 

CREATE TABLE IF NOT EXISTS recebimentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delivery_id INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('pendente','confirmado','rejeitado') DEFAULT 'pendente',
  codigo_confirmacao VARCHAR(12) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pedidos_ids TEXT NOT NULL,
  INDEX (delivery_id)
); 