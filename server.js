const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;

const uploadsDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));


// =====================================================
// MYSQL CONNECTION
// =====================================================

const sslConfig = (process.env.DB_SSL === "true" || (process.env.DB_HOST && !["127.0.0.1", "localhost"].includes(process.env.DB_HOST)))
    ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
    : undefined;

const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "DevFlow@123",
    database: process.env.DB_NAME || "ecube_pcb",
    ssl: sslConfig,

    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
});


// =====================================================
// MULTER - GERBER UPLOAD
// =====================================================

const storage = multer.diskStorage({

    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },

    filename: (_req, file, cb) => {

        const safeName = path
            .basename(file.originalname)
            .replace(/[^a-zA-Z0-9._-]/g, "_");

        const finalName =
            `${Date.now()}-${Math.round(Math.random() * 1000000000)}-${safeName}`;

        cb(null, finalName);
    }

});

const upload = multer({

    storage,

    limits: {
        fileSize: 25 * 1024 * 1024
    },

    fileFilter: (_req, file, cb) => {

        const ext = path
            .extname(file.originalname)
            .toLowerCase();

        if (ext !== ".zip" && ext !== ".rar") {

            return cb(
                new Error(
                    "Only .zip or .rar files are allowed."
                )
            );
        }

        cb(null, true);
    }

});


// =====================================================
// HELPERS
// =====================================================

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


// =====================================================
// QUOTE SELECT
// =====================================================

function quoteSelect() {

    return `

        SELECT

            q.id,
            q.customer_id,

            c.name AS customer_name,
            c.email,
            c.phone,

            q.pcb_name,
            q.width,
            q.height,
            q.quantity,

            q.dispatch_unit,
            q.base_material,
            q.layers,
            q.thickness,
            q.copper_finish,
            q.mask_color,
            q.surface_finish,
            q.silk_screen,

            q.gerber_file,
            q.delivery_date,
            q.delivery_date_1,
            q.delivery_date_2,
            q.delivery_date_3,

            q.basic_price,
            q.setup_cost,
            q.fpt_cost,
            q.gst,
            q.final_total,

            q.status,
            q.admin_note,
            q.internal_order_code,
            q.order_type,

            q.created_at,
            q.updated_at

        FROM quotes q

        INNER JOIN customers c
            ON c.id = q.customer_id

    `;
}


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", async (_req, res) => {

    try {

        await pool.query("SELECT 1");

        res.json({
            success: true,
            message:
                "E-CUBE backend and MySQL connected."
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================================
// PRICING CONFIG & SETTINGS TABLE INITIALIZATION
// =====================================================

async function initPricingConfigTable() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) DEFAULT '',
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS quotes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NOT NULL,
                pcb_name VARCHAR(255) NOT NULL,
                width DECIMAL(10,2) DEFAULT 20.00,
                height DECIMAL(10,2) DEFAULT 20.00,
                quantity INT DEFAULT 1,
                dispatch_unit VARCHAR(50) DEFAULT 'PCB',
                base_material VARCHAR(100) DEFAULT 'FR-4',
                layers VARCHAR(50) DEFAULT '2 Layers',
                thickness VARCHAR(50) DEFAULT '1.6 mm',
                copper_finish VARCHAR(50) DEFAULT '35 Micron',
                mask_color VARCHAR(50) DEFAULT 'Green',
                surface_finish VARCHAR(100) DEFAULT 'Roller Tin',
                silk_screen VARCHAR(50) DEFAULT 'White',
                gerber_file VARCHAR(255),
                delivery_date VARCHAR(50),
                delivery_date_1 VARCHAR(50),
                delivery_date_2 VARCHAR(50),
                delivery_date_3 VARCHAR(50),
                basic_price DECIMAL(10,2) DEFAULT 0.00,
                setup_cost DECIMAL(10,2) DEFAULT 0.00,
                fpt_cost DECIMAL(10,2) DEFAULT 0.00,
                gst DECIMAL(10,2) DEFAULT 0.00,
                final_total DECIMAL(10,2) DEFAULT 0.00,
                status VARCHAR(50) DEFAULT 'Pending',
                admin_note TEXT,
                internal_order_code VARCHAR(100),
                order_type VARCHAR(50) DEFAULT 'New',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pricing_config (
                id INT AUTO_INCREMENT PRIMARY KEY,
                min_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                max_cost DECIMAL(10,2) NOT NULL DEFAULT 100000.00,
                fixed_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                multiplying_factor DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
                discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value VARCHAR(255) NOT NULL
            )
        `);

        const [rows] =
            await pool.query(
                "SELECT COUNT(*) AS cnt FROM pricing_config"
            );

        if (rows[0].cnt === 0) {

            await pool.query(`
                INSERT INTO pricing_config
                (
                    min_cost,
                    max_cost,
                    fixed_charge,
                    multiplying_factor,
                    discount
                )
                VALUES
                (0.00, 1000.00, 700.00, 0.7000, 0.00),
                (1000.00, 5000.00, 0.00, 0.6500, 0.00)
            `);

        }

        await pool.query(`
            INSERT IGNORE INTO system_settings
            (setting_key, setting_value)
            VALUES
            ('delivery_working_days', '6')
        `);

        await pool.query(`
            INSERT IGNORE INTO system_settings
            (setting_key, setting_value)
            VALUES
            ('tuesday_holiday', 'true')
        `);

        // Ensure quotes table columns exist
        try {
            const [existingCols] = await pool.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quotes'
            `);
            const colMap = new Set(existingCols.map(c => c.COLUMN_NAME.toLowerCase()));
            if (colMap.size > 0) {
                if (!colMap.has('delivery_date_1')) {
                    await pool.query("ALTER TABLE quotes ADD COLUMN delivery_date_1 VARCHAR(50) DEFAULT NULL");
                }
                if (!colMap.has('delivery_date_2')) {
                    await pool.query("ALTER TABLE quotes ADD COLUMN delivery_date_2 VARCHAR(50) DEFAULT NULL");
                }
                if (!colMap.has('delivery_date_3')) {
                    await pool.query("ALTER TABLE quotes ADD COLUMN delivery_date_3 VARCHAR(50) DEFAULT NULL");
                }
                if (!colMap.has('fpt_cost')) {
                    await pool.query("ALTER TABLE quotes ADD COLUMN fpt_cost DECIMAL(10,2) DEFAULT 0.00");
                }
                if (!colMap.has('internal_order_code')) {
                    await pool.query("ALTER TABLE quotes ADD COLUMN internal_order_code VARCHAR(100) DEFAULT NULL");
                }
            }
        } catch (colErr) {
            console.warn("Quote columns verify notice:", colErr.message);
        }

    } catch (err) {

        console.error(
            "Pricing config DB init warning:",
            err.message
        );

    }

}

initPricingConfigTable();


// =====================================================
// GET PRICING CONFIG & SETTINGS
// =====================================================

app.get("/api/pricing-config", async (_req, res) => {

    try {

        const [tiers] =
            await pool.query(
                "SELECT * FROM pricing_config ORDER BY min_cost ASC"
            );

        const [settings] =
            await pool.query(
                "SELECT * FROM system_settings"
            );

        const settingsMap = {};

        settings.forEach((s) => {

            settingsMap[s.setting_key] =
                s.setting_value;

        });

        res.json({

            success: true,

            tiers: tiers,

            settings: {
                ...settingsMap,

                delivery_working_days:
                    Number(
                        settingsMap.delivery_working_days || 6
                    ),

                tuesday_holiday:
                    settingsMap.tuesday_holiday === "true" ||
                    settingsMap.tuesday_holiday === "1",

                delivery_days_1: Number(settingsMap.delivery_days_1 || 6),
                delivery_days_2: Number(settingsMap.delivery_days_2 || 10),
                delivery_days_3: Number(settingsMap.delivery_days_3 || 14),
                delivery_date_1: settingsMap.delivery_date_1 || "",
                delivery_date_2: settingsMap.delivery_date_2 || "",
                delivery_date_3: settingsMap.delivery_date_3 || "",
                delivery_discount_2: Number(settingsMap.delivery_discount_2 !== undefined ? settingsMap.delivery_discount_2 : 3),
                delivery_discount_3: Number(settingsMap.delivery_discount_3 !== undefined ? settingsMap.delivery_discount_3 : 6),
                setup_cost: Number(settingsMap.setup_cost || 700),
                gst_rate: Number(settingsMap.gst_rate || 0.18)

            }

        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================================
// UPDATE PRICING CONFIG & SETTINGS
// ADMIN
// =====================================================

app.post("/api/pricing-config", async (req, res) => {

    try {

        const { tiers, settings } = req.body;

        if (Array.isArray(tiers)) {

            await pool.query(
                "DELETE FROM pricing_config"
            );

            for (const tier of tiers) {

                await pool.execute(

                    `
                    INSERT INTO pricing_config
                    (
                        min_cost,
                        max_cost,
                        fixed_charge,
                        multiplying_factor,
                        discount
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,

                    [
                        Number(tier.min_cost || 0),
                        Number(tier.max_cost || 100000),
                        Number(tier.fixed_charge || 0),
                        Number(tier.multiplying_factor || 1),
                        Number(tier.discount || 0)
                    ]

                );

            }

        }

        if (settings) {
            for (const key of Object.keys(settings)) {
                if (settings[key] !== undefined && settings[key] !== null) {
                    const val = String(settings[key]);
                    await pool.execute(
                        `
                        INSERT INTO system_settings
                        (setting_key, setting_value)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE
                        setting_value = ?
                        `,
                        [key, val, val]
                    );
                }
            }
        }

        res.json({

            success: true,

            message:
                "Pricing configuration and settings updated successfully."

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message:
                error.message

        });

    }

});


// =====================================================
// REGISTER CUSTOMER
// SAME EMAIL + SAME PHONE = SAME CUSTOMER
// =====================================================

app.post("/api/customers", async (req, res) => {

    try {

        const name =
            String(req.body.name || "").trim();

        const email =
            String(req.body.email || "")
                .trim()
                .toLowerCase();

        const phone =
            String(req.body.phone || "").trim();


        // VALIDATION

        if (!name || !email || !phone) {

            return res.status(400).json({

                existing: false,

                message:
                    "Name, email and phone are required."

            });

        }


        if (!/^[0-9]{10}$/.test(phone)) {

            return res.status(400).json({

                existing: false,

                message:
                    "Phone number must contain exactly 10 digits."

            });

        }


        // CHECK EMAIL

        const [existing] =
            await pool.execute(

                `
                SELECT
                    id,
                    name,
                    email,
                    phone
                FROM customers
                WHERE email = ?
                LIMIT 1
                `,

                [email]

            );


        // EXISTING CUSTOMER

        if (existing.length > 0) {

            const existingCustomer =
                existing[0];

            const existingPhone =
                String(
                    existingCustomer.phone
                ).trim();


            // SAME EMAIL BUT DIFFERENT PHONE

            if (existingPhone !== phone) {

                return res.status(409).json({

                    existing: false,

                    message:
                        "This email is already registered with a different phone number."

                });

            }


            // SAME EMAIL + SAME PHONE
            // DON'T CREATE NEW CUSTOMER

            await pool.execute(

                `
                UPDATE customers
                SET name = ?
                WHERE id = ?
                `,

                [
                    name,
                    existingCustomer.id
                ]

            );


            const [customerRows] =
                await pool.execute(

                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone
                    FROM customers
                    WHERE id = ?
                    LIMIT 1
                    `,

                    [
                        existingCustomer.id
                    ]

                );


            return res.json({

                success: true,

                existing: true,

                customer_id:
                    customerRows[0].id,

                customerId:
                    customerRows[0].id,

                message:
                    "Customer already registered.",

                customer:
                    customerRows[0]

            });

        }


        // NEW CUSTOMER

        const [result] =
            await pool.execute(

                `
                INSERT INTO customers
                (name, email, phone)
                VALUES (?, ?, ?)
                `,

                [
                    name,
                    email,
                    phone
                ]

            );


        const [customerRows] =
            await pool.execute(

                `
                SELECT
                    id,
                    name,
                    email,
                    phone
                FROM customers
                WHERE id = ?
                LIMIT 1
                `,

                [
                    result.insertId
                ]

            );


        return res.status(201).json({

            success: true,

            existing: false,

            customer_id:
                customerRows[0].id,

            customerId:
                customerRows[0].id,

            message:
                "Customer registered successfully.",

            customer:
                customerRows[0]

        });


    } catch (error) {

        console.error(
            "REGISTER CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            existing: false,

            message:
                "Unable to register customer.",

            error:
                error.message

        });

    }

});


// =====================================================
// LOGIN CUSTOMER
// VALIDATE EMAIL + PHONE
// =====================================================

app.post("/api/customers/login", async (req, res) => {

    try {

        const email =
            String(req.body.email || "")
                .trim()
                .toLowerCase();

        const phone =
            String(req.body.phone || "").trim();


        if (!email || !phone) {

            return res.status(400).json({

                success: false,

                message:
                    "Both email and phone number are required to login."

            });

        }


        if (!/^[0-9]{10}$/.test(phone)) {

            return res.status(400).json({

                success: false,

                message:
                    "Phone number must contain exactly 10 digits."

            });

        }


        const [rows] =
            await pool.execute(

                `
                SELECT
                    id,
                    name,
                    email,
                    phone,
                    created_at,
                    updated_at
                FROM customers
                WHERE LOWER(email) = ?
                AND phone = ?
                LIMIT 1
                `,

                [
                    email,
                    phone
                ]

            );


        if (!rows.length) {

            const [emailCheck] =
                await pool.execute(

                    `
                    SELECT id
                    FROM customers
                    WHERE LOWER(email) = ?
                    LIMIT 1
                    `,

                    [email]

                );


            if (emailCheck.length) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Incorrect phone number for this email address."

                });

            }


            return res.status(404).json({

                success: false,

                message:
                    "No customer account found with these details. Please register first."

            });

        }


        const customer = rows[0];


        return res.json({

            success: true,

            customer_id:
                customer.id,

            customerId:
                customer.id,

            message:
                "Login successful.",

            customer:
                customer

        });


    } catch (error) {

        console.error(
            "CUSTOMER LOGIN ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to login.",

            error:
                error.message

        });

    }

});


// =====================================================
// GET ALL CUSTOMERS
// ADMIN DASHBOARD
// =====================================================

app.get("/api/customers", async (_req, res) => {

    try {

        const [rows] =
            await pool.query(`

                SELECT

                    c.id,
                    c.name,
                    c.email,
                    c.phone,

                    c.created_at,
                    c.updated_at,

                    COUNT(q.id) AS quote_count,

                    COALESCE(
                        SUM(q.final_total),
                        0
                    ) AS total_value

                FROM customers c

                LEFT JOIN quotes q
                    ON q.customer_id = c.id

                GROUP BY

                    c.id,
                    c.name,
                    c.email,
                    c.phone,
                    c.created_at,
                    c.updated_at

                ORDER BY c.id DESC

            `);


        res.json(rows);

    } catch (error) {

        console.error(
            "GET CUSTOMERS ERROR:",
            error
        );

        res.status(500).json({

            message:
                error.message

        });

    }

});


// =====================================================
// GET SINGLE CUSTOMER
// =====================================================

app.get("/api/customers/:id", async (req, res) => {

    try {

        const customerId =
            Number(req.params.id);


        if (!Number.isInteger(customerId)) {

            return res.status(400).json({

                message:
                    "Invalid customer ID."

            });

        }


        const [rows] =
            await pool.execute(

                `
                SELECT
                    id,
                    name,
                    email,
                    phone,
                    created_at,
                    updated_at
                FROM customers
                WHERE id = ?
                LIMIT 1
                `,

                [customerId]

            );


        if (!rows.length) {

            return res.status(404).json({

                message:
                    "Customer not found."

            });

        }


        return res.json({

            customer:
                rows[0]

        });


    } catch (error) {

        console.error(
            "GET SINGLE CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Unable to fetch customer.",

            error:
                error.message

        });

    }

});


// =====================================================
// CUSTOMER DASHBOARD ORDERS
// =====================================================

app.get(
    "/api/customers/:id/orders",
    async (req, res) => {

        try {

            const customerId =
                Number(req.params.id);


            if (!Number.isInteger(customerId)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid customer ID."

                });

            }


            // CUSTOMER

            const [customerRows] =
                await pool.execute(

                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone,
                        created_at,
                        updated_at
                    FROM customers
                    WHERE id = ?
                    LIMIT 1
                    `,

                    [customerId]

                );


            if (!customerRows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Customer not found."

                });

            }


            // ORDERS / QUOTES

            const [orders] =
                await pool.execute(

                    `
                    ${quoteSelect()}
                    WHERE q.customer_id = ?
                    ORDER BY q.id DESC
                    `,

                    [customerId]

                );


            return res.json({

                success: true,

                customer:
                    customerRows[0],

                orders:
                    orders

            });


        } catch (error) {

            console.error(
                "CUSTOMER DASHBOARD ORDERS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to fetch customer orders.",

                error:
                    error.message

            });

        }

    }
);


// =====================================================
// UPDATE CUSTOMER
// =====================================================

app.put("/api/customers/:id", async (req, res) => {

    try {

        const customerId =
            Number(req.params.id);

        const name =
            String(req.body.name || "").trim();

        const email =
            String(req.body.email || "")
                .trim()
                .toLowerCase();

        const phone =
            String(req.body.phone || "").trim();


        if (!Number.isInteger(customerId)) {

            return res.status(400).json({

                message:
                    "Invalid customer ID."

            });

        }


        if (!name || !email || !phone) {

            return res.status(400).json({

                message:
                    "Name, email and phone are required."

            });

        }


        if (!/^[0-9]{10}$/.test(phone)) {

            return res.status(400).json({

                message:
                    "Phone number must contain exactly 10 digits."

            });

        }


        const [duplicate] =
            await pool.execute(

                `
                SELECT
                    id,
                    email,
                    phone
                FROM customers
                WHERE
                    (email = ? OR phone = ?)
                    AND id <> ?
                LIMIT 1
                `,

                [
                    email,
                    phone,
                    customerId
                ]

            );


        if (duplicate.length) {

            return res.status(409).json({

                message:
                    "Email or phone number already belongs to another customer."

            });

        }


        const [result] =
            await pool.execute(

                `
                UPDATE customers
                SET
                    name = ?,
                    email = ?,
                    phone = ?
                WHERE id = ?
                `,

                [
                    name,
                    email,
                    phone,
                    customerId
                ]

            );


        if (result.affectedRows === 0) {

            return res.status(404).json({

                message:
                    "Customer not found."

            });

        }


        const [rows] =
            await pool.execute(

                `
                SELECT
                    id,
                    name,
                    email,
                    phone,
                    created_at,
                    updated_at
                FROM customers
                WHERE id = ?
                LIMIT 1
                `,

                [customerId]

            );


        return res.json({

            success: true,

            message:
                "Customer updated successfully.",

            customer:
                rows[0]

        });


    } catch (error) {

        console.error(
            "UPDATE CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to update customer.",

            error:
                error.message

        });

    }

});


// =====================================================
// GET ALL QUOTES
// =====================================================

app.get("/api/quotes", async (_req, res) => {

    try {

        const [rows] =
            await pool.query(`

                ${quoteSelect()}

                ORDER BY q.id DESC

            `);


        res.json(rows);

    } catch (error) {

        console.error(
            "GET QUOTES ERROR:",
            error
        );

        res.status(500).json({

            message:
                error.message

        });

    }

});


// =====================================================
// GET SINGLE QUOTE
// =====================================================

app.get("/api/quotes/:id", async (req, res) => {

    try {

        const [rows] =
            await pool.execute(

                `
                ${quoteSelect()}
                WHERE q.id = ?
                LIMIT 1
                `,

                [req.params.id]

            );


        if (!rows.length) {

            return res.status(404).json({

                message:
                    "Quote not found."

            });

        }


        res.json(rows[0]);

    } catch (error) {

        res.status(500).json({

            message:
                error.message

        });

    }

});


// =====================================================
// GET CUSTOMER QUOTES
// =====================================================

app.get(
    "/api/quotes/customer/:customerId",
    async (req, res) => {

        try {

            const customerId =
                Number(req.params.customerId);


            if (!Number.isInteger(customerId)) {

                return res.status(400).json({

                    message:
                        "Invalid customer ID."

                });

            }


            const [rows] =
                await pool.execute(

                    `
                    ${quoteSelect()}
                    WHERE q.customer_id = ?
                    ORDER BY q.id DESC
                    `,

                    [customerId]

                );


            res.json(rows);


        } catch (error) {

            console.error(
                "CUSTOMER QUOTES ERROR:",
                error
            );

            res.status(500).json({

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// LATEST CUSTOMER QUOTE
// =====================================================

app.get(
    "/api/quotes/customer/:customerId/latest",
    async (req, res) => {

        try {

            const customerId =
                Number(req.params.customerId);


            if (!Number.isInteger(customerId)) {

                return res.status(400).json({

                    message:
                        "Invalid customer ID."

                });

            }


            const [rows] =
                await pool.execute(

                    `
                    ${quoteSelect()}
                    WHERE q.customer_id = ?
                    ORDER BY q.id DESC
                    LIMIT 1
                    `,

                    [customerId]

                );


            if (!rows.length) {

                return res.status(404).json({

                    message:
                        "No quote found."

                });

            }


            res.json(rows[0]);


        } catch (error) {

            res.status(500).json({

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// MY ORDERS
// =====================================================

app.get("/api/orders", async (req, res) => {

    try {

        const params = [];

        let sql = `

            ${quoteSelect()}

            WHERE 1 = 1

        `;


        if (req.query.customer_id) {

            const customerId =
                Number(req.query.customer_id);


            if (!Number.isInteger(customerId)) {

                return res.status(400).json({

                    message:
                        "Invalid customer ID."

                });

            }


            sql +=
                " AND q.customer_id = ?";

            params.push(customerId);

        }


        sql +=
            " ORDER BY q.id DESC";


        const [rows] =
            await pool.execute(
                sql,
                params
            );


        res.json(rows);


    } catch (error) {

        console.error(
            "ORDERS ERROR:",
            error
        );

        res.status(500).json({

            message:
                error.message

        });

    }

});


// =====================================================
// CREATE QUOTE
// PROCESS ORDER
// =====================================================

app.post(
    "/api/quotes",
    upload.single("gerber"),
    async (req, res) => {

        let connection = null;

        try {

            connection =
                await pool.getConnection();


            const {

                customer_id,

                pcb_name,

                width,
                height,

                quantity,

                dispatch_unit,

                base_material,

                layers,

                thickness,

                copper_finish,

                mask_color,

                surface_finish,

                silk_screen,

                delivery_date,
                delivery_date_1,
                delivery_date_2,
                delivery_date_3,

                basic_price,

                setup_cost,
                fpt_cost,

                gst,

                final_total,

                status,

                admin_note,

                internal_order_code,

                order_type

            } = req.body;


            const gerberFileName =
                req.file
                    ? req.file.filename
                    : (
                        req.body.existing_gerber ||
                        req.body.gerber_file ||
                        null
                    );


            // =================================================
            // GERBER SIZE VALIDATION
            // 25MB MAXIMUM
            // =================================================

            if (req.file) {

                if (
                    req.file.size >
                    25 * 1024 * 1024
                ) {

                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                    }

                    return res.status(400).json({

                        success: false,

                        message:
                            "Gerber file size must not exceed 25 MB."

                    });

                }

            }


            // =================================================
            // =================================================
            // RESOLVE / CREATE CUSTOMER
            // =================================================
            let resolvedCustomerId = customer_id;
            const customerEmail = String(req.body.customer_email || "").trim().toLowerCase();
            const customerPhone = String(req.body.customer_phone || "").trim();

            if (resolvedCustomerId) {
                const [existingById] = await connection.execute(
                    `SELECT id FROM customers WHERE id = ? LIMIT 1`,
                    [resolvedCustomerId]
                );
                if (existingById.length > 0) {
                    resolvedCustomerId = existingById[0].id;
                } else {
                    resolvedCustomerId = null;
                }
            }

            if (!resolvedCustomerId && customerEmail && customerPhone) {
                const [existingByEmail] = await connection.execute(
                    `SELECT id FROM customers WHERE email = ? LIMIT 1`,
                    [customerEmail]
                );
                if (existingByEmail.length > 0) {
                    resolvedCustomerId = existingByEmail[0].id;
                } else {
                    const generatedName = customerEmail.split("@")[0].replace(/[^a-zA-Z0-9 _-]/g, "") || "PCB Customer";
                    const [insertRes] = await connection.execute(
                        `INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)`,
                        [generatedName, customerEmail, customerPhone]
                    );
                    resolvedCustomerId = insertRes.insertId;
                }
            }

            // =================================================
            // REQUIRED FIELDS
            // =================================================

            if (
                !resolvedCustomerId ||
                !pcb_name ||
                !quantity ||
                !delivery_date ||
                !gerberFileName
            ) {

                if (req.file) {

                    if (fs.existsSync(req.file.path)) {
                        fs.unlinkSync(req.file.path);
                    }

                }

                return res.status(400).json({

                    success: false,

                    message:
                        "Customer, PCB name, quantity, delivery date and Gerber file are required."

                });

            }

            // =================================================
            // TRANSACTION
            // =================================================

            await connection.beginTransaction();


            // =================================================
            // RESOLVE REPEAT ORDER & ADMIN ID
            // =================================================

            let resolvedAdminId = internal_order_code ? String(internal_order_code).trim() : null;
            let resolvedOrderType = order_type || "New";

            if (req.body.repeat_order_id) {
                const [prevById] = await connection.execute(
                    `SELECT id, internal_order_code, order_type FROM quotes 
                     WHERE id = ? LIMIT 1`,
                    [Number(req.body.repeat_order_id)]
                );
                if (prevById.length > 0) {
                    resolvedOrderType = "Repeat";
                    if (!resolvedAdminId && prevById[0].internal_order_code) {
                        resolvedAdminId = prevById[0].internal_order_code;
                    }
                }
            }

            const searchGerber = req.body.existing_gerber || (req.file ? null : req.body.gerber_file);
            if (searchGerber || !req.file) {
                const targetGerber = searchGerber || gerberFileName;
                if (targetGerber) {
                    const [prevQuotes] = await connection.execute(
                        `SELECT id, internal_order_code, order_type FROM quotes 
                         WHERE customer_id = ? AND gerber_file = ? 
                         ORDER BY id ASC LIMIT 1`,
                        [resolvedCustomerId, targetGerber]
                    );
                    if (prevQuotes.length > 0) {
                        resolvedOrderType = "Repeat";
                        if (!resolvedAdminId && prevQuotes[0].internal_order_code) {
                            resolvedAdminId = prevQuotes[0].internal_order_code;
                        }
                    }
                }
            } else if (resolvedCustomerId && pcb_name) {
                const [prevByName] = await connection.execute(
                    `SELECT id, internal_order_code, order_type FROM quotes 
                     WHERE customer_id = ? AND LOWER(pcb_name) = LOWER(?)
                     ORDER BY id ASC LIMIT 1`,
                    [resolvedCustomerId, String(pcb_name).trim()]
                );
                if (prevByName.length > 0 && prevByName[0].internal_order_code && !resolvedAdminId) {
                    resolvedAdminId = prevByName[0].internal_order_code;
                }
            }

            // =================================================
            // INSERT QUOTE
            // IMPORTANT: SQL IS INSIDE BACKTICKS
            // =================================================

            const [result] =
                await connection.execute(

                    `
                    INSERT INTO quotes (

                        customer_id,

                        pcb_name,

                        width,
                        height,

                        quantity,

                        dispatch_unit,

                        base_material,

                        layers,

                        thickness,

                        copper_finish,

                        mask_color,

                        surface_finish,

                        silk_screen,

                        gerber_file,

                        delivery_date,
                        delivery_date_1,
                        delivery_date_2,
                        delivery_date_3,

                        basic_price,

                        setup_cost,
                        fpt_cost,

                        gst,

                        final_total,

                        status,

                        admin_note,

                        internal_order_code,

                        order_type

                    )

                    VALUES (

                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?

                    )
                    `,
                    [
                        resolvedCustomerId,

                        String(
                            pcb_name
                        ).trim(),

                        number(width, 20),

                        number(height, 20),

                        number(quantity, 1),

                        dispatch_unit ||
                        "PCB",

                        base_material ||
                        "FR-4",

                        layers ||
                        "2 Layers",

                        thickness ||
                        "1.6 mm",

                        copper_finish ||
                        "35 Micron",

                        mask_color ||
                        "Green",

                        surface_finish ||
                        "Roller Tin",

                        silk_screen ||
                        "White",

                        gerberFileName,

                        delivery_date,
                        delivery_date_1 || null,
                        delivery_date_2 || null,
                        delivery_date_3 || null,

                        number(basic_price),

                        number(setup_cost),
                        number(fpt_cost),

                        number(gst),

                        number(final_total),

                        status ||
                        "Pending",

                        admin_note ||
                        null,

                        resolvedAdminId ||
                        null,

                        resolvedOrderType ||
                        "New"

                    ]

                );


            // =================================================
            // COMMIT
            // =================================================

            await connection.commit();


            // =================================================
            // RETURN SAVED QUOTE
            // =================================================

            const [rows] =
                await pool.execute(

                    `
                    ${quoteSelect()}
                    WHERE q.id = ?
                    LIMIT 1
                    `,

                    [result.insertId]

                );


            // =================================================
            // SUCCESS RESPONSE
            // =================================================

            return res.status(201).json({

                success: true,

                message:
                    "Quote submitted successfully.",

                quote:
                    rows[0]

            });


        } catch (error) {

            if (connection) {

                await connection
                    .rollback()
                    .catch(() => { });

            }


            if (
                req.file &&
                fs.existsSync(req.file.path)
            ) {

                fs.unlinkSync(
                    req.file.path
                );

            }


            console.error(
                "CREATE QUOTE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to submit quote.",

                error:
                    error.message

            });


        } finally {

            if (connection) {

                connection.release();

            }

        }

    }
);


// =====================================================
// UPDATE QUOTE
// ADMIN EDIT
// =====================================================

app.put("/api/quotes/:id", async (req, res) => {

    let connection = null;

    try {

        connection =
            await pool.getConnection();


        const {

            customer_name,

            email,
            phone,

            pcb_name,

            width,
            height,

            quantity,

            dispatch_unit,

            base_material,

            layers,

            thickness,

            copper_finish,

            mask_color,

            surface_finish,

            silk_screen,

            gerber_file,

            delivery_date,
            delivery_date_1,
            delivery_date_2,
            delivery_date_3,

            basic_price,

            setup_cost,
            fpt_cost,

            gst,

            final_total,

            status,

            admin_note,

            internal_order_code

        } = req.body;


        // =================================================
        // GET EXISTING QUOTE
        // =================================================

        const [existing] =
            await connection.execute(

                `
                SELECT
                    customer_id,
                    gerber_file
                FROM quotes
                WHERE id = ?
                LIMIT 1
                `,

                [req.params.id]

            );


        if (!existing.length) {

            return res.status(404).json({

                message:
                    "Quote not found."

            });

        }


        // =================================================
        // TRANSACTION
        // =================================================

        await connection.beginTransaction();


        // =================================================
        // UPDATE CUSTOMER
        // =================================================

        await connection.execute(

            `
            UPDATE customers

            SET

                name = ?,
                email = ?,
                phone = ?

            WHERE id = ?
            `,

            [

                String(
                    customer_name || ""
                ).trim(),

                String(
                    email || ""
                ).trim().toLowerCase(),

                String(
                    phone || ""
                ).trim(),

                existing[0].customer_id

            ]

        );


        // =================================================
        // UPDATE QUOTE
        // =================================================

        await connection.execute(

            `
            UPDATE quotes

            SET

                pcb_name = ?,

                width = ?,
                height = ?,

                quantity = ?,

                dispatch_unit = ?,

                base_material = ?,

                layers = ?,

                thickness = ?,

                copper_finish = ?,

                mask_color = ?,

                surface_finish = ?,

                silk_screen = ?,

                gerber_file = ?,

                delivery_date = ?,
                delivery_date_1 = ?,
                delivery_date_2 = ?,
                delivery_date_3 = ?,

                basic_price = ?,

                setup_cost = ?,
                fpt_cost = ?,

                gst = ?,

                final_total = ?,

                status = ?,

                admin_note = ?,
                
                internal_order_code = ?

            WHERE id = ?
            `,

            [

                String(
                    pcb_name || ""
                ).trim(),

                number(width, 20),

                number(height, 20),

                number(quantity, 1),

                dispatch_unit ||
                "PCB",

                base_material ||
                "FR-4",

                layers ||
                "2 Layers",

                thickness ||
                "1.6 mm",

                copper_finish ||
                "35 Micron",

                mask_color ||
                "Green",

                surface_finish ||
                "Roller Tin",

                silk_screen ||
                "White",

                gerber_file ||
                existing[0].gerber_file,

                delivery_date,
                delivery_date_1 || null,
                delivery_date_2 || null,
                delivery_date_3 || null,

                number(basic_price),

                number(setup_cost),
                number(fpt_cost),

                number(gst),

                number(final_total),

                status ||
                "Pending",

                admin_note ||
                null,

                internal_order_code ||
                null,

                req.params.id

            ]

        );


        // Sync Admin ID across repeated orders of the same customer and gerber
        if (internal_order_code && existing[0].customer_id && existing[0].gerber_file) {
            const adminCode = String(internal_order_code).trim();
            if (adminCode) {
                await connection.execute(
                    `UPDATE quotes 
                     SET internal_order_code = ? 
                     WHERE customer_id = ? AND gerber_file = ?`,
                    [adminCode, existing[0].customer_id, existing[0].gerber_file]
                );
            }
        }

        // =================================================
        // COMMIT
        // =================================================

        await connection.commit();


        // =================================================
        // GET UPDATED QUOTE
        // =================================================

        const [rows] =
            await pool.execute(

                `
                ${quoteSelect()}
                WHERE q.id = ?
                LIMIT 1
                `,

                [req.params.id]

            );


        return res.json({

            success: true,

            message:
                "Quote updated successfully.",

            quote:
                rows[0]

        });


    } catch (error) {

        if (connection) {

            await connection
                .rollback()
                .catch(() => { });

        }


        console.error(
            "UPDATE QUOTE ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Unable to update quote.",

            error:
                error.message

        });


    } finally {

        if (connection) {

            connection.release();

        }

    }

});


// =====================================================
// DELETE QUOTE
// =====================================================

app.delete("/api/quotes/:id", async (req, res) => {

    try {

        const [rows] =
            await pool.execute(

                `
                SELECT gerber_file
                FROM quotes
                WHERE id = ?
                LIMIT 1
                `,

                [req.params.id]

            );


        if (!rows.length) {

            return res.status(404).json({

                message:
                    "Quote not found."

            });

        }


        await pool.execute(

            `
            DELETE FROM quotes
            WHERE id = ?
            `,

            [req.params.id]

        );


        const file =
            rows[0].gerber_file;


        if (
            file &&
            !file.startsWith("http") &&
            fs.existsSync(
                path.join(
                    uploadsDir,
                    file
                )
            )
        ) {

            fs.unlinkSync(
                path.join(
                    uploadsDir,
                    file
                )
            );

        }


        res.json({

            success: true,

            message:
                "Quote deleted successfully."

        });


    } catch (error) {

        console.error(
            "DELETE QUOTE ERROR:",
            error
        );

        res.status(500).json({

            message:
                error.message

        });

    }

});


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (error, _req, res, _next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        res.status(400).json({

            success: false,

            message:
                error.message ||
                "Request failed."

        });

    }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    async () => {

        try {

            await pool.query(
                "SELECT 1"
            );

            console.log(
                `E-CUBE API running at http://localhost:${PORT}`
            );

            console.log(
                `Database: ${process.env.DB_NAME ||
                "ecube_pcb"
                }`
            );

        } catch (error) {

            console.error(
                "MySQL connection failed:",
                error.message
            );

        }

    }
);