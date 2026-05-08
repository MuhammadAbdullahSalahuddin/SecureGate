db = db.getSiblingDB('securegate_audit');

db.createCollection('sessions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'userId', 'assetId', 'userEmail', 'startedAt'],
      properties: {
        _id: {
          bsonType: 'string',
          description: 'sessionId - must be a string UUID'
        },
        userId: {
          bsonType: 'int',
          description: 'references users.id in PostgreSQL'
        },
        assetId: {
          bsonType: 'int',
          description: 'references target_assets.id in PostgreSQL'
        },
        assetName: {
          bsonType: 'string'
        },
        userEmail: {
          bsonType: 'string'
        },
        startedAt: {
          bsonType: 'date'
        },
        endedAt: {
          bsonType: ['date', 'null']
        },
        endReason: {
          bsonType: ['string', 'null'],
          enum: ['ttl_expired', 'user_disconnect', 'admin_revoke', null]
        },
        totalEvents: {
          bsonType: 'int'
        }
      }
    }
  },
  validationLevel: 'moderate',
  validationAction: 'warn'
});

db.createCollection('audit_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sessionId', 'seqNum', 'type', 'timestamp'],
      properties: {
        sessionId: {
          bsonType: 'string',
          description: 'must match a _id in the sessions collection'
        },
        seqNum: {
          bsonType: 'int',
          description: 'monotonically increasing per session, assigned in server.ts'
        },
        type: {
          bsonType: 'string',
          enum: ['session_start', 'stdin', 'stdout', 'resize', 'session_end'],
          description: 'event type - matches EventType enum in /lib/shared/types'
        },
        data: {
          bsonType: ['string', 'null'],
          description: 'raw terminal bytes - present for stdin and stdout only'
        },
        cols: {
          bsonType: ['int', 'null'],
          description: 'present for resize events only'
        },
        rows: {
          bsonType: ['int', 'null'],
          description: 'present for resize events only'
        },
        timestamp: {
          bsonType: 'date'
        }
      }
    }
  },
  validationLevel: 'moderate',
  validationAction: 'warn'
});

db.sessions.createIndex({ userId: 1 });
db.sessions.createIndex({ startedAt: -1 });

db.audit_events.createIndex(
  { sessionId: 1, seqNum: 1 },
  { unique: true }
);
db.audit_events.createIndex({ sessionId: 1, type: 1 });
db.audit_events.createIndex({ timestamp: -1 });

print('MongoDB init complete.');
print('Collections: ' + db.getCollectionNames().join(', '));
print('audit_events indexes: ');
db.audit_events.getIndexes().forEach(idx => print(' ' + JSON.stringify(idx.key)));
