const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const LightController = require("../controllers/light");

router.post("/", upload.single("file"), LightController.processForecast);
module.exports = router;
