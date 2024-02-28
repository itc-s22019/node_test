import express from "express";
import {PrismaClient} from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

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

router.get("/list", async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = 10; // 1ページあたりのアイテム数

        const totalCount = await prisma.books.count();
        const maxPage = Math.ceil(totalCount / pageSize);

        if (page < 1 || page > maxPage) {
            return res.status(404).json({ result: "Page not found" });
        }

        const books = await prisma.books.findMany({
            select: {
                id: true,
                title: true,
                author: true,
                rentals: {
                    // rentalsフィールドに関連する貸出情報を取得
                    where: {
                        returnDate: null // 返却日がnull（未返却）のレコードのみを取得
                    }
                }
            },
            take: 10, // 最大10件の書籍を取得
            skip: (page - 1) * 10 // ページネーション用のskipオプションを追加
        });


        const bookList = books.map(book => ({
            id: book.id,
            title: book.title,
            author: book.author,
            isRental: book.rentals.length > 0
        }));

        res.status(200).json({
            books: bookList,
            maxPage: maxPage
        });
    } catch (error) {
        next(error);
    }
});

router.get("/detail/:id",  async (req, res, next) => {
    const bookId = parseInt(req.params.id); // 書籍IDを取得

    try {
        // 書籍情報を取得
        const book = await prisma.books.findUnique({
            where: { id: bookId },
            select: {
                id: true,
                isbn13: true,
                title: true,
                author: true,
                publishDate: true,
                rentals: {
                    where: {
                        returnDate: null
                    },
                    select: {
                        User: { select: { name: true } },
                        rentalDate: true,
                        returnDeadline: true
                    }
                }
            }
        });

        if (!book) {
            return res.status(404).json({ result: "Book not found" });
        }

        // レスポンスデータを構築
        const responseData = {
            id: book.id,
            isbn13: book.isbn13,
            title: book.title,
            author: book.author,
            publishDate: book.publishDate,
            rentalInfo: book.rentals.length > 0 ? {
                userName: book.rentals[0].User.name,
                rentalDate: book.rentals[0].rentalDate,
                returnDeadline: book.rentals[0].returnDeadline
            } : null
        };

        res.status(200).json(responseData);
    } catch (error) {
        next(error);
    }
});

export default router;