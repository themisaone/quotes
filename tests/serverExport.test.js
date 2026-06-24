const assert = require("node:assert/strict");
const test = require("node:test");

test("server module exports the Express app without starting a listener", () => {
  process.env.DB_BACKEND = "postgres";
  const { app, startServer } = require("../src/server");

  assert.equal(typeof app, "function");
  assert.equal(typeof startServer, "function");
  assert.equal(typeof app.listen, "function");
});
