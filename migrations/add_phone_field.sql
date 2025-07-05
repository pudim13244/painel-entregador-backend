-- Verifica se a coluna phone já existe
SET @dbname = 'food_flight_delivery';
SET @tablename = 'users';
SET @columnname = 'phone';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL'
));

PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Garantir que o campo phone existe na tabela users
ALTER TABLE users MODIFY COLUMN phone VARCHAR(20) DEFAULT NULL;

-- Criar tabela delivery_profile se não existir
CREATE TABLE IF NOT EXISTS delivery_profile (
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
); 