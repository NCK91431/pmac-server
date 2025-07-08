/* 历史路由 */
const express = require("express");
const router = express.Router();
const HistoryController = require("../controllers/history");

router.get("/", HistoryController.listRecords);
router.get("/:id", HistoryController.getRecordDetail);
router.get("/:id/download/:type", HistoryController.downloadFile);
router.delete("/:id", HistoryController.deleteRecord); // 新增删除路由
module.exports = router;
