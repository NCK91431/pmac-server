/* router 历史记录-光伏发电预测 */
const express = require("express");
const router = express.Router();
const ElecHistoryController = require("../controllers/elec_history");
const AuthController = require("../controllers/auth");

// 文件下载不需要认证
router.get("/:id/download/:type", ElecHistoryController.downloadFile);

// 其他路由需要认证
router.use(AuthController.verifyToken);

router.get("/", ElecHistoryController.listRecords);
router.get("/:id", ElecHistoryController.getRecordDetail);
router.delete("/:id", ElecHistoryController.deleteRecord);

module.exports = router;
