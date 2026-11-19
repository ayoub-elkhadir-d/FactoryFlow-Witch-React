const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const errorMiddleware = require("./middlewares/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "FactoryFlow API",
    status: "ok",
    health: "/api/health",
  });
});

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

app.use(errorMiddleware);

module.exports = app;
