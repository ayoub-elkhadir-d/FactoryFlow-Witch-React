const router = require("express").Router();
const mongoose = require("mongoose");
const installationRoutes = require("./installationRoutes");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const rawMaterialRoutes = require("./rawMaterialRoutes");
const movementRoutes = require("./movmentRoutes");
const productRoutes = require("./productRoutes");
const productionOrderRoutes = require("./productionOrderRoutes");

router.get("/", (_req, res) => {
  res.json({ name: "FactoryFlow API", status: "ok", health: "/api/health" });
});

router.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

router.use("/installation", installationRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/raw-materials", rawMaterialRoutes);
router.use("/stock-movements", movementRoutes);
router.use("/products", productRoutes);
router.use("/production-orders", productionOrderRoutes);

module.exports = router;
