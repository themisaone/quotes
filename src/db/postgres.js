const { Pool } = require("pg");

function createPostgresPool(env = process.env) {
  const pool = new Pool({
    host: env.DB_HOST || "localhost",
    port: env.DB_PORT || 5432,
    database: env.DB_NAME || "quotes_db",
    user: env.DB_USER || "postgres",
    password: env.DB_PASSWORD || "postgres",
  });

  pool.dialect = "postgres";
  return pool;
}

module.exports = {
  createPostgresPool,
};
