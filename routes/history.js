/* 历史路由 */
const express = require("express");
const router = express.Router();
const HistoryController = require("../controllers/history");
const AuthController = require("../controllers/auth");

// 文件下载接口不需要认证
router.get("/:id/download/:type", HistoryController.downloadFile);

// 其他历史记录接口需要认证
router.use(AuthController.verifyToken);

router.get("/", HistoryController.listRecords);
router.get("/:id", HistoryController.getRecordDetail);
router.delete("/:id", HistoryController.deleteRecord); // 新增删除路由
module.exports = router;
