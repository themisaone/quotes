const assert = require("node:assert/strict");
const test = require("node:test");

const {
  rollbackAndStatusJson,
  rollbackAndJson,
} = require("../src/transactionResponses");

function createClient() {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      return { rows: [] };
    },
  };
}

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("rollbackAndStatusJson rolls back before sending a status response", async () => {
  const client = createClient();
  const res = createResponse();
  const payload = { error: "Invalid" };

  const returned = await rollbackAndStatusJson(client, res, 400, payload);

  assert.equal(returned, res);
  assert.deepEqual(client.calls, ["ROLLBACK"]);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, payload);
});

test("rollbackAndJson rolls back before sending a success response", async () => {
  const client = createClient();
  const res = createResponse();
  const payload = { count: 0 };

  const returned = await rollbackAndJson(client, res, payload);

  assert.equal(returned, res);
  assert.deepEqual(client.calls, ["ROLLBACK"]);
  assert.equal(res.statusCode, null);
  assert.deepEqual(res.payload, payload);
});
