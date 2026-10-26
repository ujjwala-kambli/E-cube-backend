const db = require("../config/db");

// =====================================================
// REGISTER / FIND EXISTING CUSTOMER
// =====================================================

const registerCustomer = async (req, res) => {
    try {

        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const phone = String(req.body.phone || "")
            .trim();

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!email) {
            return res.status(400).json({
                message: "Email is required."
            });
        }

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: "Invalid email address."
            });
        }

        if (!/^[0-9]{10}$/.test(phone)) {
            return res.status(400).json({
                message: "Valid 10 digit phone number is required."
            });
        }

        // =====================================================
        // CHECK EXACT EMAIL + PHONE
        // =====================================================

        const [existing] = await db.query(
            `
            SELECT id, email, phone
            FROM customers
            WHERE email = ?
            AND phone = ?
            LIMIT 1
            `,
            [email, phone]
        );

        // =====================================================
        // EXISTING CUSTOMER
        // =====================================================

        if (existing.length > 0) {

            return res.status(200).json({

                message: "Customer already exists.",

                existing: true,

                showOrders: true,

                customer: existing[0]

            });

        }

        // =====================================================
        // CREATE NEW CUSTOMER
        // =====================================================

        const [result] = await db.query(
            `
            INSERT INTO customers
            (email, phone)
            VALUES (?, ?)
            `,
            [email, phone]
        );

        return res.status(201).json({

            message: "Customer registered successfully.",

            existing: false,

            showOrders: false,

            customer: {

                id: result.insertId,

                email: email,

                phone: phone

            }

        });

    }

    catch (error) {

        console.error(
            "Customer Registration Error:",
            error
        );

        // Duplicate database key
        if (error.code === "ER_DUP_ENTRY") {

            return res.status(409).json({

                message:
                    "This email and phone number are already registered.",

                existing: true

            });

        }

        return res.status(500).json({

            message:
                "Server error while registering customer."

        });

    }
};


// =====================================================
// FIND CUSTOMER USING EMAIL + PHONE
// =====================================================

const findCustomer = async (req, res) => {

    try {

        const email = String(req.query.email || "")
            .trim()
            .toLowerCase();

        const phone = String(req.query.phone || "")
            .trim();

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!email || !phone) {

            return res.status(400).json({

                message:
                    "Email and phone number are required."

            });

        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

            return res.status(400).json({

                message:
                    "Invalid email address."

            });

        }

        if (!/^[0-9]{10}$/.test(phone)) {

            return res.status(400).json({

                message:
                    "Invalid phone number."

            });

        }

        // =====================================================
        // EXACT MATCH
        // =====================================================

        const [rows] = await db.query(

            `
            SELECT
                id,
                email,
                phone
            FROM customers
            WHERE email = ?
            AND phone = ?
            LIMIT 1
            `,

            [
                email,
                phone
            ]

        );

        // =====================================================
        // NOT FOUND
        // =====================================================

        if (!rows.length) {

            return res.status(404).json({

                message:
                    "No customer found with this email and phone number."

            });

        }

        // =====================================================
        // FOUND
        // =====================================================

        return res.json({

            customer: rows[0]

        });

    }

    catch (error) {

        console.error(
            "Find Customer Error:",
            error
        );

        return res.status(500).json({

            message:
                "Server error while finding customer."

        });

    }

};


// =====================================================
// GET CUSTOMER ORDERS
// =====================================================

const getCustomerOrders = async (req, res) => {

    try {

        const customerId = req.params.id;

        if (!customerId) {

            return res.status(400).json({

                message:
                    "Customer ID is required."

            });

        }

        // =====================================================
        // VERIFY CUSTOMER EXISTS
        // =====================================================

        const [customerRows] = await db.query(

            `
            SELECT
                id,
                email,
                phone
            FROM customers
            WHERE id = ?
            LIMIT 1
            `,

            [customerId]

        );

        if (!customerRows.length) {

            return res.status(404).json({

                message:
                    "Customer not found."

            });

        }

        // =====================================================
        // GET ORDERS
        // =====================================================

        const [orders] = await db.query(

            `
            SELECT *
            FROM quotes
            WHERE customer_id = ?
            ORDER BY created_at DESC
            `,

            [customerId]

        );

        return res.json({

            customer: customerRows[0],

            orders: orders

        });

    }

    catch (error) {

        console.error(
            "Get Customer Orders Error:",
            error
        );

        return res.status(500).json({

            message:
                "Unable to load customer orders."

        });

    }

};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    registerCustomer,

    findCustomer,

    getCustomerOrders

};