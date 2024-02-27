import express from "express";
import {check, validationResult} from "express-validator";
import {PrismaClient} from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

/** 1ペジあたりのメッセージ数 */
const maxItemCount = 10;

/**
 * 全経路でログイン済みかチェックする
 */
router.use((req, res, next) => {
    if (!req.user) {
        // 未ログイン
        const err = new Error("unauthenticated");
        err.status = 401;
        throw err;
    }
    // 問題なければ次へ
    next();
});

router.use((req, res, next) => {
    console.log(req.user.isAdmin)
    if (!req.user.isAdmin) {
        const err = new Error("NG");
        err.status = 403;
        throw err;
    }
    next();
});

// POST /admin/book/create
router.post(
    "/book/create",
    [
        check("isbn13").isNumeric(),
        check("title").isString(),
        check("author").isString(),
        check("publishDate").isISO8601(),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { isbn13, title, author, publishDate } = req.body;

        try {
            const book = await prisma.books.create({
                data: {
                    isbn13: Number(isbn13),
                    title,
                    author,
                    publishDate: new Date(publishDate),
                },
            });

            res.status(201).json({ result: "OK" });
        } catch (error) {
            console.error("Error creating book:", error);
            res.status(400).json({ result: "NG" });
        }
    }
);

router.put(
    "/book/update",
    [
        // バリデーションを定義する
        check("bookId").isInt(),
        check("isbn13").isInt(),
        check("title").isString(),
        check("author").isString(),
        check("publishDate").isISO8601().toDate(),
    ],
    async (req, res) => {
        try {
            // バリデーション結果をチェックする
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            // リクエストデータから必要な情報を取得する
            const { bookId, isbn13, title, author, publishDate } = req.body;

            // 書籍を更新する
            const updatedBook = await prisma.books.update({
                where: { id: Number(bookId) },
                data: {
                    isbn13: Number(isbn13),
                    title,
                    author,
                    publishDate,
                },
            });

            // 更新結果を返す
            res.status(200).json({ result: "OK" });
        } catch (error) {
            console.error("Error updating book:", error);
            res.status(400).json({ result: "NG" });
        }
    }
);

router.get("/rental/current", async (req, res) => {
    try {
        const currentRentals = await prisma.rental.findMany({
            where: {
                returnDate: null // 未返却の貸出のみ取得
            },
            select: {
                id: true,
                userId: true,
                bookId: true,
                rentalDate: true,
                returnDeadline: true,
                User: {
                    select: {
                        name: true
                    }
                },
                Books: {
                    select: {
                        title: true
                    }
                }
            }
        });

        const rentalsWithRenamedId = currentRentals.map(rental => {
            return {
                rentalId: rental.id,
                userId: rental.userId,
                userName: rental.User.name,
                bookId: rental.bookId,
                bookName: rental.Books.title,
                rentalDate: rental.rentalDate,
                returnDeadline: rental.returnDeadline,
            };
        });

        res.status(200).json({ rentalBooks: rentalsWithRenamedId });
    } catch (error) {
        console.error("Error fetching current rentals:", error);
        res.status(500).json({ error: "Failed to fetch current rentals" });
    }
});

router.get('/rental/current/:uid', async (req, res) => {
    try {
        const userId = parseInt(req.params.uid);

        // 管理者権限の確認は既にミドルウェアで行われているため、ここではユーザIDのみ確認
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const user = await prisma.users.findUnique({
            where: { id: userId },
            include: {
                rentals: {
                    include: {
                        Books: {
                            select: {
                                id: true,
                                title: true
                            }
                        }
                    },
                    where: {
                        returnDate: null // 返却されていない貸出のみ取得
                    },
                    orderBy: {
                        rentalDate: 'asc'
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const responseData = {
            userId: user.id,
            userName: user.name || "Unknown",
            rentalBooks: user.rentals.map(rental => ({
                rentalId: rental.id,
                bookId: rental.bookId,
                bookName: rental.Books.title,
                rentalDate: rental.rentalDate,
                returnDeadline: rental.returnDeadline
            }))
        };

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;