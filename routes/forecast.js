/* 预测路由 */
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const ForecastController = require("../controllers/forecast");

router.post("/", upload.single("file"), ForecastController.processForecast);

module.exports = router;
