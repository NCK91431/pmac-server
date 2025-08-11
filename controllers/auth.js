const jwt = require("jsonwebtoken");
const User = require("../models/User");
const smsService = require("../services/smsService");
const verificationCache = require("../services/verificationCache");
require("dotenv").config();

class AuthController {
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

    /**
     * 更新用户信息接口
     * 接收：name, company
     * 返回：更新后的用户信息
     */
    static async updateUser(req, res) {
        try {
            // 从已验证的用户中获取ID
            const userId = req.user.id;
            const { name, company } = req.body;

            // 验证输入数据
            if (!name || name.trim().length < 2) {
                return res.status(400).json({
                    error: "姓名不能为空且至少2个字符",
                });
            }

            // 公司名称可选，但如果有值则验证长度
            if (company && company.trim().length < 2) {
                return res.status(400).json({
                    error: "公司名称至少需要2个字符",
                });
            }

            // 更新用户信息
            const updatedUser = await User.update(userId, {
                name: name.trim(),
                company: company ? company.trim() : null,
            });

            if (!updatedUser) {
                return res.status(404).json({ error: "用户未找到" });
            }

            // 生成新的JWT token（包含最新用户信息）
            const newToken = jwt.sign(
                {
                    userId: updatedUser.id,
                    phone: updatedUser.phone,
                },
                process.env.JWT_SECRET
            );

            res.json({
                success: true,
                message: "用户信息更新成功",
                token: newToken, // 返回新生成的token
                user: {
                    id: updatedUser.id,
                    name: updatedUser.name,
                    phone: updatedUser.phone,
                    company: updatedUser.company,
                },
            });
        } catch (error) {
            console.error("更新用户信息失败:", error);
            res.status(500).json({
                error: "更新用户信息失败",
                details: error.message,
            });
        }
    }

    /**
     * 发送验证码接口（区分登录和注册场景）
     * 接收：phone, type (login/register)
     * 返回：发送结果
     */
    static async sendVerificationCode(req, res) {
        try {
            const { phone, type } = req.body;
            if (!phone || !type) {
                return res.status(400).json({ error: "手机号和类型不能为空" });
            }

            // 根据场景检查手机号状态
            const userExists = await User.findByPhone(phone);

            if (type === "login") {
                // 登录场景：用户必须存在
                if (!userExists) {
                    return res.status(404).json({
                        error: "用户不存在，请先注册",
                        code: "USER_NOT_FOUND",
                    });
                }
            } else if (type === "register") {
                // 注册场景：用户不能存在
                if (userExists) {
                    return res.status(409).json({
                        error: "该手机号已注册，请直接登录",
                        code: "USER_ALREADY_EXISTS",
                    });
                }
            } else {
                return res.status(400).json({ error: "无效的类型参数" });
            }

            // 生成4位随机验证码
            const code = Math.floor(1000 + Math.random() * 9000).toString();

            // 发送短信
            const sent = await smsService.sendVerificationCode(phone, code);

            if (!sent) {
                return res.status(500).json({ error: "验证码发送失败" });
            }

            // 存储验证码（带类型信息）
            verificationCache.storeCode(phone, code, type);

            res.json({ success: true, message: "验证码已发送" });
        } catch (error) {
            console.error("发送验证码失败:", error);
            res.status(500).json({
                error: "发送验证码失败",
                details: error.message,
            });
        }
    }

    /**
     * 注册接口
     * 接收：phone, code
     * 返回：token和用户信息
     */
    static async register(req, res) {
        try {
            const { phone, code, name, company } = req.body;

            if (!phone || !code) {
                return res
                    .status(400)
                    .json({ error: "手机号和验证码不能为空" });
            }

            // 验证验证码（检查注册场景）
            if (!verificationCache.verifyCode(phone, code, "register")) {
                return res.status(401).json({ error: "验证码无效或已过期" });
            }

            // 再次检查用户是否已存在（防止并发注册）
            const existingUser = await User.findByPhone(phone);
            if (existingUser) {
                return res
                    .status(409)
                    .json({ error: "该手机号已注册，请直接登录" });
            }

            // 使用手机尾号后4位作为默认用户名
            const defaultName = phone.slice(-4);

            // 创建新用户
            const user = await User.create({
                phone,
                name: name ? name : defaultName,
                company: company ? company : null,
            });

            // 生成JWT token
            const token = jwt.sign(
                { userId: user.id, phone: user.phone },
                process.env.JWT_SECRET
            );

            res.json({
                success: true,
                message: "注册成功",
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
     * 登录接口
     * 接收：phone, code
     * 返回：token和用户信息
     */
    static async login(req, res) {
        try {
            const { phone, code } = req.body;

            if (!phone || !code) {
                return res
                    .status(400)
                    .json({ error: "手机号和验证码不能为空" });
            }

            // 验证验证码（检查登录场景）
            if (!verificationCache.verifyCode(phone, code, "login")) {
                return res.status(401).json({ error: "验证码无效或已过期" });
            }

            // 查找用户
            const user = await User.findByPhone(phone);

            if (!user) {
                return res.status(404).json({
                    error: "用户不存在，请先注册",
                    code: "USER_NOT_FOUND",
                });
            }

            // 生成JWT token
            const token = jwt.sign(
                { userId: user.id, phone: user.phone },
                process.env.JWT_SECRET
            );

            res.json({
                success: true,
                message: "登录成功",
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
}

module.exports = AuthController;
