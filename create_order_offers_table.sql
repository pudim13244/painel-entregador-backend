-- Criar tabela order_offers para gerenciar ofertas de pedidos
CREATE TABLE IF NOT EXISTS `order_offers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `deliveryman_id` int(11) NOT NULL,
  `status` ENUM('pending','accepted','rejected','expired') DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_deliveryman_id` (`deliveryman_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  UNIQUE KEY `unique_order_deliveryman` (`order_id`, `deliveryman_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 