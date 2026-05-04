export enum Role {
  ADMIN    = 'ADMIN',
  OPERATOR = 'OPERATOR',
  AUDITOR  = 'AUDITOR',
}

export enum EventType {
  SESSION_START = 'session_start',
  STDIN         = 'stdin',
  STDOUT        = 'stdout',
  RESIZE        = 'resize',
  SESSION_END   = 'session_end',
}

export enum DbType {
  MYSQL   = 'mysql',
  MONGODB = 'mongodb',
}
