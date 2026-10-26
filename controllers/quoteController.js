const db = require("../config/db");
const fs = require("fs");
const path = require("path");

// =====================================================
// CREATE QUOTE
// =====================================================

const createQuote = async (req, res) => {
    try {
        console.log("QUOTE REQUEST BODY:", req.body);
        console.log("QUOTE FILE:", req.file);

        const {
            customer_id,
            pcb_name,
            dispatch_unit,
            base_material,
            width,
            height,
            quantity,
            layers,
            thickness,
            copper_finish,
            mask_color,
            surface_finish,
            silk_screen,
            delivery_date,
            basic_price,
            setup_cost,
            gst,
            final_total,
            status
        } = req.body;

        // =================================================
        // REQUIRED VALIDATION
        // =================================================

        if (!customer_id) {
            return res.status(400).json({
                message: "Customer ID is required."
            });
        }

        if (!pcb_name || !pcb_name.trim()) {
            return res.status(400).json({
                message: "PCB Name is required."
            });
        }

        if (!dispatch_unit) {
            return res.status(400).json({
                message: "Dispatch Unit is required."
            });
        }

        if (!width || !height) {
            return res.status(400).json({
                message: "PCB width and height are required."
            });
        }

        const pcbWidth = Number(width);
        const pcbHeight = Number(height);
        const pcbQuantity = Number(quantity);

        // =================================================
        // PCB SIZE VALIDATION
        // =================================================

        if (
            !Number.isFinite(pcbWidth) ||
            pcbWidth < 20 ||
            pcbWidth > 370
        ) {
            return res.status(400).json({
                message: "PCB width must be between 20 mm and 370 mm."
            });
        }

        if (
            !Number.isFinite(pcbHeight) ||
            pcbHeight < 20 ||
            pcbHeight > 370
        ) {
            return res.status(400).json({
                message: "PCB height must be between 20 mm and 370 mm."
            });
        }

        // =================================================
        // QUANTITY VALIDATION
        // =================================================

        if (
            !Number.isFinite(pcbQuantity) ||
            pcbQuantity < 3 ||
            pcbQuantity > 500
        ) {
            return res.status(400).json({
                message: "Quantity must be between 3 and 500."
            });
        }

        // =================================================
        // CUSTOMER CHECK
        // =================================================

        const [customer] = await db.query(
            `
            SELECT id, email, phone
            FROM customers
            WHERE id = ?
            LIMIT 1
            `,
            [customer_id]
        );

        if (customer.length === 0) {
            return res.status(404).json({
                message: "Customer not found."
            });
        }

        // =================================================
        // GERBER FILE CHECK
        // =================================================

        if (!req.file) {
            return res.status(400).json({
                message: "Gerber file is required."
            });
        }

        // =================================================
        // FILE VALIDATION
        // =================================================

        const fileName = req.file.originalname;
        const extension = path
            .extname(fileName)
            .toLowerCase();

        if (
            extension !== ".zip" &&
            extension !== ".rar"
        ) {
            return res.status(400).json({
                message: "Only .zip or .rar Gerber files are allowed."
            });
        }

        // 25 MB maximum
        if (req.file.size > 25 * 1024 * 1024) {
            return res.status(400).json({
                message: "Gerber file must be less than 25MB."
            });
        }

        // =================================================
        // PRICE VALUES
        // =================================================

        const basicPriceValue =
            Number(basic_price) || 0;

        const setupCostValue =
            Number(setup_cost) || 0;

        const gstValue =
            Number(gst) || 0;

        const finalTotalValue =
            Number(final_total) || 0;

        // =================================================
        // INSERT QUOTE
        // =================================================

        const [result] = await db.query(
            `
            INSERT INTO quotes
            (
                customer_id,
                pcb_name,
                dispatch_unit,
                base_material,
                width,
                height,
                quantity,
                layers,
                thickness,
                copper_finish,
                mask_color,
                surface_finish,
                silk_screen,
                delivery_date,
                basic_price,
                setup_cost,
                gst,
                final_total,
                gerber_file,
                status
            )
            VALUES
            (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?
            )
            `,
            [
                customer_id,
                pcb_name.trim(),
                dispatch_unit,
                base_material || "FR-4",
                pcbWidth,
                pcbHeight,
                pcbQuantity,
                layers || "1 Layer",
                thickness || "1.6 mm",
                copper_finish || "35 Micron",
                mask_color || "Green",
                surface_finish || "Roller Tin",
                silk_screen || "White",
                delivery_date || null,
                basicPriceValue,
                setupCostValue,
                gstValue,
                finalTotalValue,
                req.file.filename,
                status || "Pending"
            ]
        );

        // =================================================
        // SUCCESS RESPONSE
        // =================================================

        return res.status(201).json({
            message: "Quote created successfully.",
            quote: {
                id: result.insertId,
                customer_id,
                pcb_name: pcb_name.trim(),
                dispatch_unit,
                width: pcbWidth,
                height: pcbHeight,
                quantity: pcbQuantity,
                delivery_date,
                basic_price: basicPriceValue,
                setup_cost: setupCostValue,
                gst: gstValue,
                final_total: finalTotalValue,
                gerber_file: req.file.filename,
                status: status || "Pending"
            }
        });

    } catch (error) {

        console.error(
            "CREATE QUOTE ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while creating quote.",
            error: error.message
        });
    }
};


// =====================================================
// GET ALL QUOTES
// =====================================================

const getAllQuotes = async (req, res) => {
    try {

        const [quotes] = await db.query(
            `
            SELECT
                q.*,
                c.email AS customer_email,
                c.phone AS customer_phone
            FROM quotes q
            LEFT JOIN customers c
                ON q.customer_id = c.id
            ORDER BY q.id DESC
            `
        );

        return res.status(200).json({
            success: true,
            quotes
        });

    } catch (error) {

        console.error(
            "GET QUOTES ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while fetching quotes.",
            error: error.message
        });
    }
};


// =====================================================
// UPDATE QUOTE
// =====================================================

const updateQuote = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            pcb_name,
            dispatch_unit,
            base_material,
            width,
            height,
            quantity,
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
            internal_order_code,
            admin_note
        } = req.body;

        if (!id) {
            return res.status(400).json({
                message: "Quote ID is required."
            });
        }

        // =================================================
        // SIZE VALIDATION
        // =================================================

        if (
            width !== undefined &&
            (Number(width) < 20 || Number(width) > 370)
        ) {
            return res.status(400).json({
                message: "Width must be between 20 and 370 mm."
            });
        }

        if (
            height !== undefined &&
            (Number(height) < 20 || Number(height) > 370)
        ) {
            return res.status(400).json({
                message: "Height must be between 20 and 370 mm."
            });
        }

        // =================================================
        // UPDATE
        // =================================================

        const [result] = await db.query(
            `
            UPDATE quotes
            SET
                pcb_name = COALESCE(?, pcb_name),
                dispatch_unit = COALESCE(?, dispatch_unit),
                base_material = COALESCE(?, base_material),
                width = COALESCE(?, width),
                height = COALESCE(?, height),
                quantity = COALESCE(?, quantity),
                layers = COALESCE(?, layers),
                thickness = COALESCE(?, thickness),
                copper_finish = COALESCE(?, copper_finish),
                mask_color = COALESCE(?, mask_color),
                surface_finish = COALESCE(?, surface_finish),
                silk_screen = COALESCE(?, silk_screen),
                delivery_date = COALESCE(?, delivery_date),
                delivery_date_1 = COALESCE(?, delivery_date_1),
                delivery_date_2 = COALESCE(?, delivery_date_2),
                delivery_date_3 = COALESCE(?, delivery_date_3),
                basic_price = COALESCE(?, basic_price),
                setup_cost = COALESCE(?, setup_cost),
                fpt_cost = COALESCE(?, fpt_cost),
                gst = COALESCE(?, gst),
                final_total = COALESCE(?, final_total),
                status = COALESCE(?, status),
                internal_order_code = COALESCE(?, internal_order_code),
                admin_note = COALESCE(?, admin_note)
            WHERE id = ?
            `,
            [
                pcb_name || null,
                dispatch_unit || null,
                base_material || null,
                width !== undefined ? Number(width) : null,
                height !== undefined ? Number(height) : null,
                quantity !== undefined ? Number(quantity) : null,
                layers || null,
                thickness || null,
                copper_finish || null,
                mask_color || null,
                surface_finish || null,
                silk_screen || null,
                delivery_date || null,
                delivery_date_1 || null,
                delivery_date_2 || null,
                delivery_date_3 || null,
                basic_price !== undefined
                    ? Number(basic_price)
                    : null,
                setup_cost !== undefined
                    ? Number(setup_cost)
                    : null,
                fpt_cost !== undefined
                    ? Number(fpt_cost)
                    : null,
                gst !== undefined
                    ? Number(gst)
                    : null,
                final_total !== undefined
                    ? Number(final_total)
                    : null,
                status || null,
                internal_order_code || null,
                admin_note || null,
                id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Quote not found."
            });
        }

        return res.status(200).json({
            message: "Quote updated successfully."
        });

    } catch (error) {

        console.error(
            "UPDATE QUOTE ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while updating quote.",
            error: error.message
        });
    }
};


// =====================================================
// UPDATE QUOTE STATUS
// =====================================================

const updateQuoteStatus = async (req, res) => {
    try {

        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: "Status is required."
            });
        }

        const [result] = await db.query(
            `
            UPDATE quotes
            SET status = ?
            WHERE id = ?
            `,
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Quote not found."
            });
        }

        return res.status(200).json({
            message: "Quote status updated successfully."
        });

    } catch (error) {

        console.error(
            "UPDATE STATUS ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while updating quote status.",
            error: error.message
        });
    }
};


// =====================================================
// DELETE ONE QUOTE
// =====================================================

const deleteQuote = async (req, res) => {
    try {

        const { id } = req.params;

        // Get file first
        const [quotes] = await db.query(
            `
            SELECT gerber_file
            FROM quotes
            WHERE id = ?
            `,
            [id]
        );

        if (quotes.length === 0) {
            return res.status(404).json({
                message: "Quote not found."
            });
        }

        const gerberFile = quotes[0].gerber_file;

        // Delete database record
        await db.query(
            `
            DELETE FROM quotes
            WHERE id = ?
            `,
            [id]
        );

        // Delete uploaded file
        if (gerberFile) {

            const filePath = path.join(
                __dirname,
                "..",
                "uploads",
                gerberFile
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        return res.status(200).json({
            message: "Quote deleted successfully."
        });

    } catch (error) {

        console.error(
            "DELETE QUOTE ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while deleting quote.",
            error: error.message
        });
    }
};


// =====================================================
// DELETE ALL QUOTES
// =====================================================

const deleteAllQuotes = async (req, res) => {
    try {

        const [quotes] = await db.query(
            `
            SELECT gerber_file
            FROM quotes
            `
        );

        await db.query(
            `
            DELETE FROM quotes
            `
        );

        // Delete files
        for (const quote of quotes) {

            if (!quote.gerber_file) {
                continue;
            }

            const filePath = path.join(
                __dirname,
                "..",
                "uploads",
                quote.gerber_file
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        return res.status(200).json({
            message: "All quotes deleted successfully."
        });

    } catch (error) {

        console.error(
            "DELETE ALL QUOTES ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error while deleting all quotes.",
            error: error.message
        });
    }
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
    createQuote,
    getAllQuotes,
    updateQuote,
    updateQuoteStatus,
    deleteQuote,
    deleteAllQuotes
};