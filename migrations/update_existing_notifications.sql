-- Atualização da estrutura existente de notificações

-- Verificar se os campos já existem antes de adicionar
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND COLUMN_NAME = 'type') = 0,
  'ALTER TABLE notifications ADD COLUMN type ENUM("ORDER", "SYSTEM", "PAYMENT", "GENERAL") DEFAULT "GENERAL" AFTER content;',
  'SELECT "Column type already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND COLUMN_NAME = 'priority') = 0,
  'ALTER TABLE notifications ADD COLUMN priority ENUM("LOW", "MEDIUM", "HIGH", "URGENT") DEFAULT "MEDIUM" AFTER type;',
  'SELECT "Column priority already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND COLUMN_NAME = 'action_url') = 0,
  'ALTER TABLE notifications ADD COLUMN action_url VARCHAR(500) NULL AFTER priority;',
  'SELECT "Column action_url already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND COLUMN_NAME = 'expires_at') = 0,
  'ALTER TABLE notifications ADD COLUMN expires_at TIMESTAMP NULL AFTER action_url;',
  'SELECT "Column expires_at already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND COLUMN_NAME = 'updated_at') = 0,
  'ALTER TABLE notifications ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;',
  'SELECT "Column updated_at already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adicionar índices se não existirem
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND INDEX_NAME = 'idx_type') = 0,
  'ALTER TABLE notifications ADD INDEX idx_type (type);',
  'SELECT "Index idx_type already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND INDEX_NAME = 'idx_priority') = 0,
  'ALTER TABLE notifications ADD INDEX idx_priority (priority);',
  'SELECT "Index idx_priority already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND INDEX_NAME = 'idx_created_at') = 0,
  'ALTER TABLE notifications ADD INDEX idx_created_at (created_at);',
  'SELECT "Index idx_created_at already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
   WHERE TABLE_SCHEMA = DATABASE() 
   AND TABLE_NAME = 'notifications' 
   AND INDEX_NAME = 'idx_expires_at') = 0,
  'ALTER TABLE notifications ADD INDEX idx_expires_at (expires_at);',
  'SELECT "Index idx_expires_at already exists" as message;'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Criar tabela de configurações se não existir
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
WHERE id = 1 AND (type IS NULL OR type = '');

UPDATE notifications SET 
  type = 'GENERAL',
  priority = 'LOW'
WHERE id = 4 AND (type IS NULL OR type = '');

-- Inserir configurações padrão para usuários entregadores existentes
INSERT IGNORE INTO user_notification_settings (user_id)
SELECT id FROM users WHERE role = 'DELIVERY';

-- Inserir algumas notificações de exemplo se não existirem
INSERT IGNORE INTO notifications (title, content, type, priority, target_type) VALUES
('Bem-vindo ao sistema!', 'Seu cadastro foi aprovado. Comece a receber pedidos agora!', 'SYSTEM', 'HIGH', 'DELIVERY'),
('Novo pedido disponível', 'Há um novo pedido disponível na sua área. Verifique o dashboard!', 'ORDER', 'MEDIUM', 'DELIVERY'),
('Pagamento recebido', 'Você recebeu R$ 15,00 pela entrega do pedido #1234', 'PAYMENT', 'HIGH', 'DELIVERY'); 