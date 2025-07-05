-- Migração simples para adicionar campos necessários

-- Adicionar campos à tabela notifications
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS type ENUM('ORDER', 'SYSTEM', 'PAYMENT', 'GENERAL') DEFAULT 'GENERAL' AFTER content;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM' AFTER type;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS action_url VARCHAR(500) NULL AFTER priority;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL AFTER action_url;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Criar tabela de configurações
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

-- Atualizar notificações existentes
UPDATE notifications SET type = 'SYSTEM', priority = 'MEDIUM' WHERE id = 1;
UPDATE notifications SET type = 'GENERAL', priority = 'LOW' WHERE id = 4;

-- Inserir configurações para entregadores
INSERT IGNORE INTO user_notification_settings (user_id)
SELECT id FROM users WHERE role = 'DELIVERY'; 