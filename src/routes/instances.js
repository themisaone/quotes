function registerInstanceRoutes(
  app,
  {
    instanceManager,
    currentPort,
    logger = console,
    terminateSelf = () => process.kill(process.pid, "SIGTERM"),
    shutdownDelayMs = 400,
  }
) {
  if (!app) throw new Error("Express app is required");
  if (!instanceManager) throw new Error("instanceManager is required");

  app.get("/api/instances", async (req, res) => {
    try {
      const data = await instanceManager.listInstances(currentPort);
      res.json(data);
    } catch (e) {
      logger.error("GET /api/instances:", e);
      res.status(500).json({ error: e.message || "Failed to list instances" });
    }
  });

  app.post("/api/instances/start", async (req, res) => {
    try {
      const { mode } = req.body || {};
      const result = await instanceManager.startInstance(mode, currentPort);
      res.json(result);
    } catch (e) {
      logger.error("POST /api/instances/start:", e);
      res.status(e.status || 500).json({ error: e.message || "Failed to start instance" });
    }
  });

  app.post("/api/instances/stop", async (req, res) => {
    try {
      const port = req.body?.port;
      const result = await instanceManager.stopInstance(port, currentPort);
      res.json(result);
      if (result.self) {
        setTimeout(terminateSelf, shutdownDelayMs);
      }
    } catch (e) {
      logger.error("POST /api/instances/stop:", e);
      res.status(e.status || 500).json({ error: e.message || "Failed to stop instance" });
    }
  });
}

module.exports = {
  registerInstanceRoutes,
};
