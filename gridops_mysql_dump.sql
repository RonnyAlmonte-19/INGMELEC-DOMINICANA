-- ========================================================================
-- GRIDOPS ENTERPRISE V2 - ENTERPRISE DATA DUMP
-- Compatible con MySQL / MariaDB (phpMyAdmin / phpMaster)
-- Generado para presentación ejecutiva de infraestructura crítica
-- ========================================================================

CREATE DATABASE IF NOT EXISTS `gridops_enterprise`;
USE `gridops_enterprise`;

-- Deshabilitar restricciones de claves foráneas temporalmente para importación limpia
SET FOREIGN_KEY_CHECKS = 0;

-- ========================================================================
-- 1. ESTRUCTURA DE TABLAS (DDL)
-- ========================================================================

-- Tabla: users
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) UNIQUE NOT NULL,
  `email` VARCHAR(100) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `zone` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT 'Activo',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: coordinadores
DROP TABLE IF EXISTS `coordinadores`;
CREATE TABLE `coordinadores` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `zone` VARCHAR(100) NOT NULL,
  `campamento` VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: supervisores
DROP TABLE IF EXISTS `supervisores`;
CREATE TABLE `supervisores` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `cargo` VARCHAR(100) NOT NULL,
  `coordinator_id` INT,
  FOREIGN KEY (`coordinator_id`) REFERENCES `coordinadores`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: brigadas
DROP TABLE IF EXISTS `brigadas`;
CREATE TABLE `brigadas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `vehicle` VARCHAR(50) NOT NULL,
  `supervisor_id` INT,
  `zone` VARCHAR(100) NOT NULL,
  `campamento` VARCHAR(100) NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Activo',
  FOREIGN KEY (`supervisor_id`) REFERENCES `supervisores`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: technicians
DROP TABLE IF EXISTS `technicians`;
CREATE TABLE `technicians` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `cedula` VARCHAR(20) UNIQUE NOT NULL,
  `codigo_empleado` VARCHAR(50) UNIQUE NOT NULL,
  `telefono` VARCHAR(30) DEFAULT NULL,
  `tipo_sangre` VARCHAR(5) DEFAULT NULL,
  `licencia` VARCHAR(50) DEFAULT NULL,
  `vigencia_licencia` DATE DEFAULT NULL,
  `sie` VARCHAR(50) DEFAULT NULL,
  `licencia_sie` VARCHAR(20) DEFAULT 'Válido',
  `talla_camisa` VARCHAR(5) DEFAULT NULL,
  `talla_pantalon` VARCHAR(5) DEFAULT NULL,
  `talla_bota` VARCHAR(5) DEFAULT NULL,
  `brigada_id` INT,
  `supervisor_id` INT,
  `coordinator_id` INT,
  `estado` VARCHAR(20) DEFAULT 'Activo',
  `fecha_ingreso` DATE DEFAULT NULL,
  FOREIGN KEY (`brigada_id`) REFERENCES `brigadas`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`supervisor_id`) REFERENCES `supervisores`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`coordinator_id`) REFERENCES `coordinadores`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: inventory
DROP TABLE IF EXISTS `inventory`;
CREATE TABLE `inventory` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `stock` INT NOT NULL,
  `min` INT NOT NULL,
  `location` VARCHAR(100) NOT NULL,
  `status` VARCHAR(50) DEFAULT 'Disponible',
  `value` DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: brigade_tools
DROP TABLE IF EXISTS `brigade_tools`;
CREATE TABLE `brigade_tools` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `brigada_id` INT NOT NULL,
  `item_code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `req_qty` INT NOT NULL,
  `del_qty` INT NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Entregado',
  `obs` TEXT DEFAULT NULL,
  FOREIGN KEY (`brigada_id`) REFERENCES `brigadas`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_code`) REFERENCES `inventory`(`code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: actas
DROP TABLE IF EXISTS `actas`;
CREATE TABLE `actas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `tipo` VARCHAR(100) NOT NULL,
  `destino` VARCHAR(100) NOT NULL,
  `responsable` VARCHAR(100) NOT NULL,
  `fecha` DATE NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Pendiente',
  `firmado` TINYINT DEFAULT 0,
  `signature_data` LONGTEXT DEFAULT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `anexos` TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: acta_items
DROP TABLE IF EXISTS `acta_items`;
CREATE TABLE `acta_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `acta_id` INT NOT NULL,
  `item_code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `qty` INT NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  FOREIGN KEY (`acta_id`) REFERENCES `actas`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: reposiciones
DROP TABLE IF EXISTS `reposiciones`;
CREATE TABLE `reposiciones` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `colaborador` VARCHAR(100) NOT NULL,
  `item` VARCHAR(100) NOT NULL,
  `motivo` VARCHAR(255) NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Pendiente',
  `fecha` DATE NOT NULL,
  `supervisor_id` INT,
  `coordinator_id` INT,
  FOREIGN KEY (`supervisor_id`) REFERENCES `supervisores`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`coordinator_id`) REFERENCES `coordinadores`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: swaps
DROP TABLE IF EXISTS `swaps`;
CREATE TABLE `swaps` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `herramienta_anterior` VARCHAR(100) NOT NULL,
  `herramienta_nueva` VARCHAR(100) NOT NULL,
  `brigada_id` INT,
  `tecnico` VARCHAR(100) NOT NULL,
  `motivo` VARCHAR(255) NOT NULL,
  `fecha` DATE NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Completado',
  FOREIGN KEY (`brigada_id`) REFERENCES `brigadas`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: devoluciones
DROP TABLE IF EXISTS `devoluciones`;
CREATE TABLE `devoluciones` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `colaborador` VARCHAR(100) NOT NULL,
  `brigada_id` INT,
  `item` VARCHAR(100) NOT NULL,
  `cant_esperada` INT NOT NULL,
  `cant_devuelta` INT NOT NULL,
  `estado` VARCHAR(50) DEFAULT 'Pendiente',
  `observacion` TEXT DEFAULT NULL,
  FOREIGN KEY (`brigada_id`) REFERENCES `brigadas`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: auditoria
DROP TABLE IF EXISTS `auditoria`;
CREATE TABLE `auditoria` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `fecha` DATETIME NOT NULL,
  `usuario` VARCHAR(50) NOT NULL,
  `rol` VARCHAR(50) NOT NULL,
  `accion` VARCHAR(100) NOT NULL,
  `entidad` VARCHAR(100) NOT NULL,
  `antes` TEXT NOT NULL,
  `despues` TEXT NOT NULL,
  `zona` VARCHAR(100) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `user_agent` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-habilitar restricciones de claves foráneas
SET FOREIGN_KEY_CHECKS = 1;

-- ========================================================================
-- 2. VALORES SEMILLA DE DATOS (DML)
-- ========================================================================

-- Insertar: coordinadores
INSERT INTO `coordinadores` (`id`, `code`, `name`, `zone`, `campamento`) VALUES
(1, 'COORD-001', 'William', 'Noroeste Lote 4', 'Mantenimiento Noroeste');

-- Insertar: supervisores
INSERT INTO `supervisores` (`id`, `code`, `name`, `cargo`, `coordinator_id`) VALUES
(1, 'SUP-001', 'Isaac Gedeoni Ulloa Javier', 'Supervisor TCT', 1),
(2, 'SUP-002', 'Cristian Perdomo Durán', 'Supervisor Mantenimiento', 1),
(3, 'SUP-003', 'RONNY ALMONTE A', 'Supervisor TCT', 1);

-- Insertar: users
-- Contraseñas cifradas equivalentes a '1234' para simulación segura
INSERT INTO `users` (`id`, `username`, `email`, `password`, `role`, `zone`, `status`) VALUES
(1, 'dev', 'developer@gridops.com', '3485e0cda34163999ff6b1e428597b5d:b0c37fdf7da9beef1fa73f798742c29fda1ad2046f8494920796fe2db1162e3f486dcd59147c107eef3c4eec7f9fadfccb96b2b74ffcaa098eda72c55c0b3052', 'Developer', 'Sistema Central', 'Activo'),
(2, 'gerente', 'gerente@gridops.com', '43fcc015fffbc12d0ad60e8f78fe1063:6e18e525deb1bec706c22dc9d7ec5e2a9b7f4d03bc6d7b4c209f59b8bf6f4e3d38823c9b752ad1c1c3d8fd4b589c8c1b39faeb3f3bcbaed1bcdd6a849bc6527c', 'Gerente', 'Lote Central', 'Activo'),
(3, 'william', 'coordinador@gridops.com', '7dd2e225d7830d53c38dca8be6f798e8:631edf53f833bd20f2b2be3b34ed3ae1268faa1fa037a60e8e0c85d66f5438b1ac09dfb6cd1afcbbe5f07bc57cf4d33de90c1f97c00806125372feaa7af86033', 'Coordinador', 'Noroeste Lote 4', 'Activo'),
(4, 'isaac', 'supervisor@gridops.com', '44970eec9ee6ac586aaa86e1ee8d3e51:85392abefde81337d7e577dff2a11b4bec52a737ee1e30c4e4d309e89c6ecc2c43ccaa7e5345c4a748f122d66b52b645c2d5eb792eb3eee9a704751bfd85e46f', 'Supervisor', 'Noroeste Lote 4', 'Activo'),
(5, 'cristian', 'supervisor2@gridops.com', '98b54365ae7fcd7dba21a500b52bbae7:50f75c855b5865e3cd40d9b8a33bfcf5c8616277691857eabff7f842c65211ed364a1cd584e72e3c3dbdb5d94a96c252cc3b71dc83361f7a10fc7f14fea9ed3b', 'Supervisor', 'Noroeste Lote 4', 'Activo'),
(6, 'ronny', 'ronny@gridops.com', 'f0d2c5e5b8076f2522a5a3dd726937b2:012ebb2003f11cdc273cf26a8336d4416e9905e92ce702af54a8260786a1529a90907b8f38ac5ad1ea1965c5e08c57eaf0436f0fa9d18e049381cc4d044d59f7', 'Supervisor TCT', 'Noroeste Lote 4', 'Activo');

-- Insertar: brigadas
INSERT INTO `brigadas` (`id`, `code`, `type`, `vehicle`, `supervisor_id`, `zone`, `campamento`, `estado`) VALUES
(1, 'MRC04-001', 'TCT', 'L535228 (Canasto)', 1, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo'),
(2, 'MRC04-002', 'Luminaria', 'L112839 (Camión)', 1, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo'),
(3, 'MRC04-003', 'Canasto', 'L992834 (PickUp)', 2, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo'),
(4, 'MRC04-004', 'Averías', 'L283945 (Moto)', 3, 'Noroeste Lote 4', 'Mantenimiento Noroeste', 'Activo');

-- Insertar: technicians
INSERT INTO `technicians` (`id`, `name`, `cedula`, `codigo_empleado`, `telefono`, `tipo_sangre`, `licencia`, `vigencia_licencia`, `sie`, `licencia_sie`, `talla_camisa`, `talla_pantalon`, `talla_bota`, `brigada_id`, `supervisor_id`, `coordinator_id`, `estado`, `fecha_ingreso`) VALUES
(1, 'Juan Antonio Jiménez', '001-1823945-8', 'EMP-9831', '809-555-0101', 'O+', 'Categoría 3', '2030-12-31', 'CERT-SIE-9831', 'Válido', 'XL', '36', '43', 1, 1, 1, 'Activo', '2024-01-15'),
(2, 'Pedro Manuel Almonte', '002-1827394-1', 'EMP-2938', '809-555-0102', 'A+', 'Categoría 2', '2029-08-15', 'CERT-SIE-1122', 'Válido', 'L', '34', '42', 1, 1, 1, 'Activo', '2024-02-20'),
(3, 'Carlos Rafael Valdez', '093-1827384-9', 'EMP-8877', '829-555-0199', 'O-', 'Categoría 4', '2031-05-10', 'CERT-SIE-9900', 'Válido', 'XXL', '38', '44', 2, 1, 1, 'Activo', '2023-11-05'),
(4, 'Luis Emilio Rosario', '047-9283748-2', 'EMP-1123', '849-555-0238', 'B+', 'Categoría 2', '2028-10-22', 'CERT-SIE-2834', 'Por Vencer', 'M', '32', '40', 3, 2, 1, 'Activo', '2025-03-01'),
(5, 'Ramón Antonio Valdez', '402-2837482-9', 'DEMO-7362', '809-555-9876', 'O+', 'Categoría 3', '2030-05-25', 'CERT-SIE-9988', 'Válido', 'XL', '36', '43', 4, 3, 1, 'Activo', '2026-05-25');

-- Insertar: inventory
INSERT INTO `inventory` (`id`, `code`, `name`, `category`, `type`, `stock`, `min`, `location`, `status`, `value`) VALUES
(1, 'EPP-CASDI', 'Casco Dieléctrico de Protección 20KV', 'EPP', 'EPP', 45, 10, 'Bodega Noroeste A2', 'Disponible', 35.00),
(2, 'EPP-GUAIS', 'Guantes Dieléctricos Alta Tensión Clase 2', 'EPP', 'EPP', 50, 10, 'Bodega Noroeste A3', 'Disponible', 120.00),
(3, 'EPP-PROFA', 'Protector Facial Arco Eléctrico', 'EPP', 'EPP', 25, 5, 'Bodega Noroeste A4', 'Disponible', 95.00),
(4, 'EPP-ARNES', 'Arnés Completo de Liniero Contra Caídas', 'EPP', 'EPP', 30, 8, 'Bodega Noroeste B1', 'Disponible', 150.00),
(5, 'EPP-BOTDI', 'Botas Dieléctricas Impermeables de Cuero', 'EPP', 'EPP', 40, 10, 'Bodega Noroeste B2', 'Disponible', 85.00),
(6, 'EPC-MANAI', 'Mangas Aislantes de Goma para Linieros', 'EPC', 'EPC', 18, 5, 'Bodega Noroeste C1', 'Disponible', 75.00),
(7, 'HER-PTAIS', 'Pértiga Aislada Extensible Escopeta 12m', 'Herramientas', 'Equipamiento', 12, 3, 'Bodega Noroeste D1', 'Disponible', 350.00),
(8, 'HER-DETTE', 'Detector de Tensión Personal por Inducción', 'Herramientas', 'Equipamiento', 20, 5, 'Bodega Noroeste D2', 'Disponible', 110.00),
(9, 'HER-TABLE', 'Tablet Android de Campo Uso Rudo IP68', 'Tech', 'Tech', 15, 3, 'Bodega Noroeste Tech1', 'Disponible', 450.00);

-- Insertar: brigade_tools
INSERT INTO `brigade_tools` (`id`, `brigada_id`, `item_code`, `name`, `req_qty`, `del_qty`, `category`, `estado`, `obs`) VALUES
(1, 1, 'EPP-CASDI', 'Casco Dieléctrico de Protección 20KV', 2, 2, 'EPP', 'Entregado', 'Perfecto estado'),
(2, 1, 'EPP-GUAIS', 'Guantes Dieléctricos Alta Tensión Clase 2', 4, 4, 'EPP', 'Entregado', 'Inspeccionados'),
(3, 1, 'HER-PTAIS', 'Pértiga Aislada Extensible Escopeta 12m', 1, 1, 'Herramientas', 'Entregado', 'Equipo de rescate'),
(4, 4, 'EPP-CASDI', 'Casco Dieléctrico de Protección 20KV', 1, 1, 'EPP', 'Entregado', 'Entrega inicial demo');

-- Insertar: actas
INSERT INTO `actas` (`id`, `code`, `tipo`, `destino`, `responsable`, `fecha`, `estado`, `firmado`, `signature_data`, `observaciones`, `anexos`) VALUES
(1, 'ACT-2026-001', 'Asignación Herramientas', 'Brigada: MRC04-001', 'Isaac Gedeoni Ulloa Javier', '2026-05-24', 'Firmada', 1, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'Acta inicial de entrega en orden.', '[\"Anexo 1: Formulario SST firmado digitalmente por coordinador William\"]'),
(2, 'ACT-2026-002', 'Entrega EPP Inicial (TCT)', 'Técnico: Pedro Manuel Almonte', 'Isaac Gedeoni Ulloa Javier', '2026-05-25', 'Pendiente', 0, NULL, 'Pendiente de firma del técnico operador.', NULL);

-- Insertar: acta_items
INSERT INTO `acta_items` (`id`, `acta_id`, `item_code`, `name`, `qty`, `category`) VALUES
(1, 1, 'EPP-CASDI', 'Casco Dieléctrico de Protección 20KV', 2, 'EPP'),
(2, 1, 'EPP-GUAIS', 'Guantes Dieléctricos Alta Tensión Clase 2', 4, 'EPP'),
(3, 1, 'HER-PTAIS', 'Pértiga Aislada Extensible Escopeta 12m', 1, 'Herramientas'),
(4, 2, 'EPP-CASDI', 'Casco Dieléctrico de Protección 20KV', 1, 'EPP'),
(5, 2, 'EPP-GUAIS', 'Guantes Dieléctricos Alta Tensión Clase 2', 2, 'EPP');

-- Insertar: auditoria
INSERT INTO `auditoria` (`id`, `code`, `fecha`, `usuario`, `rol`, `accion`, `entidad`, `antes`, `despues`, `zona`, `ip`, `user_agent`) VALUES
(1, 'AUD-001', '2026-05-25 14:42:36', 'gerente', 'Gerente', 'CREACION_USUARIO_SEGURIDAD', 'Operador @ronny', 'Inexistente', 'Nombre: RONNY ALMONTE A, Rol: Supervisor TCT, Zona: Noroeste Lote 4', 'Noroeste Lote 4', '192.168.1.5', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'),
(2, 'AUD-002', '2026-05-25 14:42:42', 'ronny', 'Supervisor TCT', 'LOGIN', 'ERP Console Authenticator', 'Offline', 'Online', 'Noroeste Lote 4', '192.168.1.5', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'),
(3, 'AUD-003', '2026-05-25 14:43:41', 'ronny', 'Supervisor TCT', 'NUEVA_ACTA_ENTREGA', 'Acta ACT-2026-005', 'Borrador', 'Destino: Ing. Ramón Antonio Valdez, Tipo: Entrega EPP (TCT), Artículos Despachados: 8', 'Noroeste Lote 4', '192.168.1.5', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');

-- ========================================================================
-- FIN DEL DATA DUMP - GRIDOPS ENTERPRISE V2
-- ========================================================================
