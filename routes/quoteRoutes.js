const express = require("express");

const router = express.Router();

const {
    createQuote,
    getAllQuotes,
    updateQuote,
    updateQuoteStatus,
    deleteQuote,
    deleteAllQuotes
} = require("../controllers/quoteController");

const upload =
    require("../middleware/upload");


// =====================================================
// CREATE QUOTE
// =====================================================

router.post(
    "/quotes",
    upload.single("gerber_file"),
    createQuote
);


// =====================================================
// GET ALL QUOTES
// =====================================================

router.get(
    "/quotes",
    getAllQuotes
);


// =====================================================
// UPDATE QUOTE
// =====================================================

router.put(
    "/quotes/:id",
    updateQuote
);


// =====================================================
// UPDATE STATUS
// =====================================================

router.patch(
    "/quotes/:id/status",
    updateQuoteStatus
);


// =====================================================
// DELETE ONE
// =====================================================

router.delete(
    "/quotes/:id",
    deleteQuote
);


// =====================================================
// DELETE ALL
// =====================================================

router.delete(
    "/quotes",
    deleteAllQuotes
);


module.exports = router;