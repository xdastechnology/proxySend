const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { dbGet, dbAll, dbRun } = require('./database');

function serialize(value) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(value) {
  if (!value) return null;
  return JSON.parse(value, BufferJSON.reviver);
}

function toStorableValue(type, value) {
  if (!value) return value;
  if (type === 'app-state-sync-key' && typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return value;
}

function fromStoredValue(type, value) {
  if (!value) return value;
  if (type === 'app-state-sync-key') {
    return proto.Message.AppStateSyncKeyData.fromObject(value);
  }
  return value;
}

async function hasTursoAuthState(userId) {
  const row = await dbGet('SELECT user_id FROM wa_auth_creds WHERE user_id = ?', [userId]);
  return Boolean(row);
}

async function clearTursoAuthState(userId) {
  await dbRun('DELETE FROM wa_auth_keys WHERE user_id = ?', [userId]);
  await dbRun('DELETE FROM wa_auth_creds WHERE user_id = ?', [userId]);
}

async function getKeysForType(userId, type, ids) {
  if (!ids || ids.length === 0) {
    return {};
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await dbAll(
    `SELECT id, data_json
     FROM wa_auth_keys
     WHERE user_id = ? AND type = ? AND id IN (${placeholders})`,
    [userId, type, ...ids]
  );

  const index = new Map(rows.map((row) => [row.id, deserialize(row.data_json)]));
  const result = {};

  for (const id of ids) {
    const raw = index.get(id);
    if (raw) {
      result[id] = fromStoredValue(type, raw);
    }
  }

  return result;
}

async function setKeysForType(userId, type, dataById) {
  const ids = Object.keys(dataById || {});

  for (const id of ids) {
    const value = dataById[id];

    if (!value) {
      await dbRun(
        'DELETE FROM wa_auth_keys WHERE user_id = ? AND type = ? AND id = ?',
        [userId, type, id]
      );
      continue;
    }

    await dbRun(
      `INSERT INTO wa_auth_keys (user_id, type, id, data_json, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, type, id)
       DO UPDATE SET data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP`,
      [userId, type, id, serialize(toStorableValue(type, value))]
    );
  }
}

async function useTursoAuthState(userId) {
  const row = await dbGet('SELECT creds_json FROM wa_auth_creds WHERE user_id = ?', [userId]);
  const state = {
    creds: row ? deserialize(row.creds_json) : initAuthCreds(),
    keys: {
      get: async (type, ids) => getKeysForType(userId, type, ids),
      set: async (data) => {
        const tasks = Object.entries(data || {}).map(([type, dataById]) =>
          setKeysForType(userId, type, dataById)
        );
        await Promise.all(tasks);
      },
    },
  };

  const saveCreds = async () => {
    await dbRun(
      `INSERT INTO wa_auth_creds (user_id, creds_json, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id)
       DO UPDATE SET creds_json = excluded.creds_json, updated_at = CURRENT_TIMESTAMP`,
      [userId, serialize(state.creds)]
    );
  };

  return { state, saveCreds };
}

module.exports = {
  useTursoAuthState,
  hasTursoAuthState,
  clearTursoAuthState,
};
