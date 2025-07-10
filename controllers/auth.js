const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

class AuthController {
    static async login(req, res) {
        try {
            const { name, phone, company } = req.body;

            if (!phone) {
                return res.status(400).json({ error: "电话号不能为空" });
            }

            // 创建或更新用户
            const user = await User.createOrUpdate({ name, phone, company });

            // 生成JWT token（无过期时间）
            const token = jwt.sign(
                { userId: user.id, phone: user.phone },
                process.env.JWT_SECRET
            );

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    phone: user.phone,
                    company: user.company,
                },
            });
        } catch (error) {
            console.error("登录失败:", error);
            res.status(500).json({ error: "登录失败", details: error.message });
        }
    }

    static async verifyToken(req, res, next) {
        const token = req.headers.authorization;

        if (!token) {
            return res.status(401).json({ error: "未提供认证令牌" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.userId);

            if (!req.user) {
                return res.status(401).json({ error: "用户不存在" });
            }

            next();
        } catch (error) {
            console.error("令牌验证失败:", error);
            res.status(401).json({ error: "无效的认证令牌" });
        }
    }
}

module.exports = AuthController;
