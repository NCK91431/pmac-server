/* router 光伏发电预测 */
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");
const ElecController = require("../controllers/elec");
const fileInfoRouter = require("../routes/elec_fileinfo");

router.post("/", upload.single("file"), ElecController.processForecast);
router.use("/fileinfo", fileInfoRouter);

module.exports = router;
