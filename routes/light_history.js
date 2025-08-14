const express = require("express");
const router = express.Router();
const LightHistoryController = require("../controllers/light_history");
const AuthController = require("../controllers/auth");

// 文件下载不需要认证
router.get("/:id/download", LightHistoryController.downloadUploadFile);

// 其他接口需要认证
router.use(AuthController.verifyToken);
router.get("/", LightHistoryController.listRecords);
router.get("/:id", LightHistoryController.getRecordDetail);
router.delete("/:id", LightHistoryController.deleteRecord);

module.exports = router;
