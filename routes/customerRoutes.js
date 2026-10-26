const express = require("express");

const router = express.Router();

const {
    registerCustomer,
    findCustomer,
    getCustomerOrders
} = require("../controllers/customerController");


// =====================================================
// REGISTER CUSTOMER
// =====================================================

router.post(
    "/customers",
    registerCustomer
);


// =====================================================
// FIND CUSTOMER
// EMAIL + PHONE EXACT MATCH
// =====================================================

router.get(
    "/customers/find",
    findCustomer
);


// =====================================================
// CUSTOMER ORDERS
// =====================================================

router.get(
    "/customers/:id/orders",
    getCustomerOrders
);


module.exports = router;