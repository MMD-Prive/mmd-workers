import test from "node:test";
import assert from "node:assert/strict";

import {
  createMmdShopFulfillment,
  normalizeMmdShopShipping,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
  transitionMmdShopFulfillment,
  writeMmdShopFulfillment,
} from "../../shared/mmd-shop-fulfillment.mjs";
import {
  deriveMmdProductCommerceState,
  isAdminShopOperationsApiRequest,
  isAdminShopOperationsPageRequest,
} from "../../admin-worker/src/mmd-shop-operations-admin.js";
import { isAdminShopOrdersApiRequest } from "../../admin-worker/src/mmd-shop-orders-admin.js";

test("shipping contract validates delivery and permits pickup without address", () => {
  const delivery = normalizeMmdShopShipping({
    delivery_method: "delivery",
    address_line1: "99 Sukhumvit Road",
    district: "Watthana",
    province: "Bangkok",
    postal_code: "10110",
  }, { name: "Customer", phone: "0812345678" });

  assert.equal(delivery.delivery_method, "delivery");
  assert.equal(delivery.recipient_name, "Customer");
  assert.equal(delivery.postal_code, "10110");

  const pickup = normalizeMmdShopShipping({
    delivery_method: "pickup",
  }, { name: "Customer", phone: "0812345678" });

  assert.equal(pickup.delivery_method, "pickup");
  assert.equal(pickup.address_line1, "");
});

test("fulfillment metadata round-trips inside order notes without deleting audit text", () => {
  const shipping = normalizeMmdShopShipping({
    delivery_method: "delivery",
    address_line1: "1 Bangkok Road",
    district: "Pathum Wan",
    province: "Bangkok",
    postal_code: "10330",
  }, { name: "MMD Customer", phone: "0891112222" });

  const initial = createMmdShopFulfillment({ shipping });
  const notes = writeMmdShopFulfillment("schema=mmd_shop_order_v1; payment_verification_required=true", initial);

  assert.match(notes, /schema=mmd_shop_order_v1/);
  const decoded = readMmdShopFulfillment(notes);
  assert.equal(decoded.delivery_method, "delivery");
  assert.equal(decoded.state, "awaiting_payment");

  const confirmed = transitionMmdShopFulfillment(decoded, { state: "confirmed" });
  const preparing = transitionMmdShopFulfillment(confirmed, { state: "preparing" });
  assert.equal(preparing.state, "preparing");
  assert.ok(preparing.confirmed_at);
  assert.ok(preparing.preparing_at);
});

test("public fulfillment masks shipping phone while admin view may reveal it", () => {
  const value = createMmdShopFulfillment({
    shipping: {
      delivery_method: "pickup",
      recipient_name: "Customer",
      phone: "0812345678",
    },
  });

  assert.equal(publicMmdShopFulfillment(value).phone, "081•••678");
  assert.equal(publicMmdShopFulfillment(value, { maskPhone: false }).phone, "0812345678");
});

test("admin shop operation route ownership is narrow", () => {
  assert.equal(isAdminShopOperationsPageRequest("/internal/admin/shop/inventory", "GET"), true);
  assert.equal(isAdminShopOperationsPageRequest("/internal/admin/shop/products", "GET"), true);
  assert.equal(isAdminShopOperationsPageRequest("/internal/admin/shop/orders", "GET"), false);
  assert.equal(isAdminShopOperationsApiRequest("/v1/admin/shop/inventory", "GET"), true);
  assert.equal(isAdminShopOperationsApiRequest("/v1/admin/shop/products/update", "POST"), true);
  assert.equal(isAdminShopOperationsApiRequest("/v1/admin/shop/products/update", "GET"), false);
  assert.equal(isAdminShopOrdersApiRequest("/v1/admin/shop/orders/fulfillment", "POST"), true);
});


test("product authority derives tracked, out-of-stock, untracked and on-demand eligibility", () => {
  const tracked = deriveMmdProductCommerceState({
    sku: "WGG-10",
    product_name: "Water GG Plus 10ml",
    shared_status: "active",
    mmd_enabled: true,
    mmd_price_thb: 1000,
    supplier_count: 1,
    quantity_remaining: 2,
    active_batches: 1,
  });
  assert.equal(tracked.stock_status, "tracked");
  assert.equal(tracked.online_checkout_status, "available");
  assert.equal(tracked.checkout_eligible, true);

  const out = deriveMmdProductCommerceState({
    sku: "WGG-25",
    product_name: "Water GG Plus 25ml",
    shared_status: "active",
    mmd_enabled: true,
    mmd_price_thb: 2500,
    supplier_count: 1,
    quantity_remaining: 0,
    active_batches: 1,
  });
  assert.equal(out.stock_status, "tracked");
  assert.equal(out.online_checkout_status, "out_of_stock");
  assert.equal(out.checkout_eligible, false);

  const untracked = deriveMmdProductCommerceState({
    sku: "TEST-UNTRACKED",
    product_name: "Untracked Product",
    shared_status: "active",
    mmd_enabled: true,
    mmd_price_thb: 1000,
    supplier_count: 1,
    quantity_remaining: 0,
    active_batches: 0,
  });
  assert.equal(untracked.stock_status, "untracked");
  assert.equal(untracked.online_checkout_status, "stock_untracked");
  assert.equal(untracked.checkout_eligible, false);

  const onDemand = deriveMmdProductCommerceState({
    sku: "GLEN-POP15-BLK",
    product_name: "Glenburgies Pop Plus",
    product_note: "15ml / black bottle / on-demand / no stock",
    shared_status: "active",
    mmd_enabled: true,
    mmd_price_thb: 1500,
    supplier_count: 1,
    quantity_remaining: 0,
    active_batches: 0,
  });
  assert.equal(onDemand.availability_mode, "on_demand");
  assert.equal(onDemand.stock_status, "on_demand");
  assert.equal(onDemand.online_checkout_status, "on_demand");
  assert.equal(onDemand.checkout_eligible, true);
});
