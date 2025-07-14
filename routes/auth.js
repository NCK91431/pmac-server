const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/auth");

router.post("/register", AuthController.register);

router.post("/login", AuthController.login);

// 更新用户信息 - 需要进行用户登录认证
router.use(AuthController.verifyToken);
router.post("/update", AuthController.updateUser);

module.exports = router;
