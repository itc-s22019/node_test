import express from "express";
import {check, validationResult} from "express-validator";
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

router.post(
    "/start",
    [
        check("bookId").isNumeric().withMessage("Book ID must be a number"),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { bookId } = req.body;
        const userId = req.user.id;

        try {
            // Check if the book is already rented
            const existingRental = await prisma.rental.findFirst({
                where: {
                    bookId,
                    returnDate: null,
                },
            });

            if (existingRental) {
                return res.status(409).json({ result: "Book is already rented" });
            }

            // Start rental
            const newRental = await prisma.rental.create({
                data: {
                    bookId,
                    userId,
                    rentalDate: new Date(),
                    returnDeadline: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000), // Assuming return deadline is 7 days from now
                },
                select: {
                    id: true,
                    bookId: true,
                    rentalDate: true,
                    returnDeadline: true,
                },
            });

            res.status(201).json(newRental);
        } catch (error) {
            console.error("Error starting rental:", error);
            res.status(400).json({ result: "Failed to start rental" });
        }
    }
);

router.put(
    "/return",
    [
        check("rentalId").isNumeric().withMessage("Rental ID must be a number"),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { rentalId } = req.body;
        const userId = req.user.id;

        try {
            // Check if the rental exists and belongs to the user
            const rental = await prisma.rental.findFirst({
                where: {
                    id: rentalId,
                    userId,
                },
            });

            if (!rental) {
                return res.status(400).json({ result: "NG", message: "Rental not found or does not belong to the user" });
            }

            if (rental.returnDate) {
                return res.status(400).json({ result: "NG", message: "Book is already returned" });
            }

            // Update rental with returnDate
            await prisma.rental.update({
                where: { id: rentalId },
                data: {
                    returnDate: new Date(),
                },
            });

            res.status(200).json({ result: "OK" });
        } catch (error) {
            console.error("Error returning rental:", error);
            res.status(400).json({ result: "NG", message: "Failed to return rental" });
        }
    }
);

router.get("/current", async (req, res) => {
    const userId = req.user.id;

    try {
        const currentRentals = await prisma.rental.findMany({
            where: {
                userId,
                returnDate: null,
            },
            include: {
                Books: true,
            },
        });

        const rentalBooks = currentRentals.map((rental) => ({
            rentalId: rental.id,
            bookId: rental.bookId,
            bookName: rental.Books.title,
            rentalDate: rental.rentalDate,
            returnDeadline: rental.returnDeadline,
        }));

        res.status(200).json({ rentalBooks });
    } catch (error) {
        console.error("Error fetching current rentals:", error);
        res.status(400).json({ result: "Failed to fetch current rentals" });
    }
});

router.get("/history", async (req, res) => {
    const userId = req.user.id;

    try {
        const rentalHistory = await prisma.rental.findMany({
            where: {
                userId,
                returnDate: {
                    not: null,
                },
            },
            include: {
                Books: true,
            },
        });

        const formattedHistory = rentalHistory.map((rental) => ({
            rentalId: rental.id,
            bookId: rental.bookId,
            bookName: rental.Books.title,
            rentalDate: rental.rentalDate,
            returnDate: rental.returnDate,
        }));

        res.status(200).json({ rentalHistory: formattedHistory });
    } catch (error) {
        console.error("Error fetching rental history:", error);
        res.status(400).json({ result: "Failed to fetch rental history" });
    }
});

export default router;