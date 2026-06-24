async function rollbackAndStatusJson(client, res, status, payload) {
  await client.query("ROLLBACK");
  return res.status(status).json(payload);
}

async function rollbackAndJson(client, res, payload) {
  await client.query("ROLLBACK");
  return res.json(payload);
}

module.exports = {
  rollbackAndStatusJson,
  rollbackAndJson,
};
