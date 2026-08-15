CREATE DATABASE IF NOT EXISTS `sanjuautoac`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'User_Sanju'@'localhost' IDENTIFIED BY 'Pw_Sanju';
ALTER USER 'User_Sanju'@'localhost' IDENTIFIED BY 'Pw_Sanju';

GRANT ALL PRIVILEGES ON `sanjuautoac`.* TO 'User_Sanju'@'localhost';
FLUSH PRIVILEGES;
