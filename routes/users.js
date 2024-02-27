import express from "express";
import {check, validationResult} from "express-validator";
import passport from "passport";
import {calcHash, generateSalt} from "../util/auth.js";
import {PrismaClient} from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

/**
 * ログイン状態チェック
 */
router.get("/check", (req, res, next) => {
  if (!req.user) {
    // 未ログインなら、Error オブジェクトを作って、ステータスを設定してスロー
    const err = new Error("unauthenticated");
    err.status = 401;
    throw err;
  }
  const isAdmin = req.user.isAdmin
  // ここに来れるなら、ログイン済み。
  res.json({
    result: "OK",
    isAdmin: isAdmin
  });
});

/**
 * ユーザ認証
 */
router.post("/login", passport.authenticate("local", {
  failWithError: true // passport によるログインに失敗したらエラーを発生させる
}), (req, res, next) => {
  // ここに来れるなら、ログインは成功していることになる。
  const isAdmin = req.user.isAdmin;
  res.json({
    result: "OK",
    isAdmin: isAdmin
  });
});

/**
 * ユーザ新規作成
 */
router.post("/register", [
  check("name").notEmpty({ignore_whitespace: true}),
  check("password").notEmpty({ignore_whitespace: true}),
  check("email").isEmail() // 追加:メールアドレス
], async (req, res, next) => {
  if (!validationResult(req).isEmpty()) {
    res.status(400).json({
      result: "NG" //"username, password, and/or email is empty or invalid"
    });
    return;
  }
  const {name, password, email} = req.body; // 追加:メールアドレス
  const salt = generateSalt();
  const hashed = calcHash(password, salt);
  try {
    await prisma.users.create({
      data: {
        name,
        password: hashed,
        salt,
        email // 追加:メールアドレス
      }
    });
    res.status(201).json({
      message: "created"
    });
  } catch (e) {
    switch (e.code) {
      case "P2002":
        res.status(400).json({
          message: "NG"  //"username is already registered"
        });
        break;
      default:
        console.error(e);
        res.status(500).json({
          message: "NG"   //"unknown error"
        });
    }
  }
})

/**
 * ユーザーのログアウト
 */
router.get("/logout", (req, res) => {
  req.logout((err) => {res.status(200).json({ result: "OK" });});
});

export default router;