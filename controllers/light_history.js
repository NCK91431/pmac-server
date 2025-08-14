const Light = require("../models/Light");
const path = require("path");
const fs = require("fs");

class LightHistoryController {
    static async listRecords(req, res) {
        try {
            const records = await Light.findByUserId(req.user.id);
            res.json(records);
        } catch (error) {
            console.error("获取简易预测记录失败:", error);
            res.status(500).json({ error: "获取记录失败" });
        }
    }

    static async downloadUploadFile(req, res) {
        try {
            const { id } = req.params;
            console.log(`收到下载请求，记录ID: ${id}`);

            // 获取记录
            const record = await Light.findById(id);

            if (!record) {
                console.log(`记录不存在，ID: ${id}`);
                return res.status(404).json({ error: "记录不存在" });
            }

            console.log("找到记录:", record);
            console.log("文件路径:", record.upload_file_path);

            // 检查文件路径是否存在
            if (!record.upload_file_path) {
                console.log("文件路径为空");
                return res.status(404).json({ error: "文件路径未找到" });
            }

            // 检查文件是否存在
            if (!fs.existsSync(record.upload_file_path)) {
                console.log(`文件不存在: ${record.upload_file_path}`);
                return res.status(404).json({
                    error: "文件不存在",
                    details: `文件路径: ${record.upload_file_path}`,
                });
            }

            // 获取文件名
            const fileName = path.basename(record.upload_file_path);
            console.log(`开始下载文件: ${fileName}`);

            // 设置响应头
            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename=${encodeURIComponent(fileName)}`
            );

            // 创建文件流并发送
            const fileStream = fs.createReadStream(record.upload_file_path);
            fileStream.pipe(res);
        } catch (error) {
            console.error("下载文件失败:", error);
            res.status(500).json({
                error: "下载失败",
                details: error.message,
                stack:
                    process.env.NODE_ENV === "development"
                        ? error.stack
                        : undefined,
            });
        }
    }
    // 获取记录详情
    static async getRecordDetail(req, res) {
        try {
            const { id } = req.params;
            const record = await Light.findById(id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在" });
            }

            // 验证记录是否属于当前用户
            if (record.user_id !== req.user.id) {
                return res.status(403).json({ error: "无权访问该记录" });
            }

            const resultData = {
                success: true,
                id: record.id,
                ESS_cap_kwh: record.ess_cap_kwh,
                PV_cap_kw: record.pv_cap_kw,
                P_max_charge_kw: record.p_max_charge_kw,
                annual_savings: record.annual_savings,
                daily_operation_cost: record.daily_operation_cost,
                investment_cost: record.investment_cost,
            };

            res.json(resultData);
        } catch (error) {
            console.error("获取记录详情失败:", error);
            res.status(500).json({ error: "获取记录详情失败" });
        }
    }

    // 删除记录
    static async deleteRecord(req, res) {
        try {
            const { id } = req.params;
            const record = await Light.findById(id);

            if (!record) {
                return res.status(404).json({ error: "记录不存在" });
            }

            // 验证记录是否属于当前用户
            if (record.user_id !== req.user.id) {
                return res.status(403).json({ error: "无权删除该记录" });
            }

            // 删除文件（如果存在）
            if (
                record.upload_file_path &&
                fs.existsSync(record.upload_file_path)
            ) {
                fs.unlinkSync(record.upload_file_path);
            }

            // 删除数据库记录
            const affectedRows = await Light.deleteById(id);

            if (affectedRows === 0) {
                return res.status(404).json({ error: "删除记录失败" });
            }

            res.json({ message: "记录删除成功", success: true });
        } catch (error) {
            console.error("删除记录失败:", error);
            res.status(500).json({ error: "删除记录失败" });
        }
    }
}

module.exports = LightHistoryController;
