const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

class AuthController {
    /**
     * 用户注册接口
     * 接收：name, phone, company
     * 返回：token和用户信息
     */
    static async register(req, res) {
        try {
            const { name, phone, company } = req.body;

            if (!name || !phone) {
                return res.status(400).json({ error: "姓名、电话不能为空" });
            }

            // 检查电话是否已注册
            const existingUser = await User.findByPhone(phone);
            if (existingUser) {
                return res.status(409).json({ error: "该电话号码已注册" });
            }

            // 创建新用户并获取完整用户对象
            const user = await User.create({ name, phone, company });

            if (!user) {
                throw new Error("用户创建失败");
            }

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
            console.error("注册失败:", error);
            res.status(500).json({ error: "注册失败", details: error.message });
        }
    }
    /**
     * 用户登录第二步：确认登录并生成token
     * 接收：name,phone
     * 返回：token和用户信息
     */
    static async login(req, res) {
        try {
            const { name, phone } = req.body;

            if (!name || !phone) {
                return res.status(400).json({ error: "姓名、电话不能为空" });
            }

            // 查找用户
            const user = await User.findByPhone(phone);

            if (!user) {
                return res.status(404).json({ error: "用户不存在" });
            }

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
