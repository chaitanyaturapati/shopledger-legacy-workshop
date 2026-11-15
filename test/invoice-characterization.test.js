var test = require('node:test');
var assert = require('node:assert/strict');

var tax = require('../lib/tax');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('CURRENT BEHAVIOUR: GST resolver treats numeric rates at or below 1 as decimals', function () {
  assert.equal(tax.getRateForItem({ gstRate: 1 }), 1);
  assert.equal(tax.getSlabPercent({ gstRate: 1 }), 100);
  assert.equal(tax.getRateForItem({ gstRate: 5 }), 0.05);
});

test('invoice uses the order HSN slab for tax and total', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var orderTotals = pricing.computeTotals(items, '');
  var invoiceTotals = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(orderTotals.tax, 5);
  assert.equal(orderTotals.total, 105);
  assert.equal(invoiceTotals.tax, orderTotals.tax);
  assert.equal(invoiceTotals.total, orderTotals.total);
});

test('invoice figures match the order pricing breakdown for HSN GST and coupon orders', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 2000, qty: 1 }];
  var orderTotals = pricing.computeTotals(items, 'SAVE10');
  var invoiceTotals = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(invoiceTotals.subtotal, orderTotals.subtotal);
  assert.equal(invoiceTotals.discount, orderTotals.discount);
  assert.equal(invoiceTotals.tax, orderTotals.tax);
  assert.equal(invoiceTotals.cgst, orderTotals.cgst);
  assert.equal(invoiceTotals.sgst, orderTotals.sgst);
  assert.equal(invoiceTotals.total, orderTotals.total);
});

test('invoice applies the same capped coupon discount and post-discount tax as order pricing', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 2000, qty: 1 }];
  var orderTotals = pricing.computeTotals(items, 'SAVE10');
  var invoiceTotals = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(orderTotals.discount, 150);
  assert.equal(orderTotals.tax, 92.5);
  assert.equal(orderTotals.total, 1942.5);
  assert.equal(invoiceTotals.discount, orderTotals.discount);
  assert.equal(invoiceTotals.tax, orderTotals.tax);
  assert.equal(invoiceTotals.total, orderTotals.total);
});

test('invoice tax and GST rows follow order pricing per-line rounding', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [
      { name: 'A', price: 0.03, qty: 1, gstRate: 18 },
      { name: 'B', price: 0.03, qty: 1, gstRate: 18 }
    ]
  });

  assert.deepEqual(figures.rows.map(function (row) { return row.lineTax; }), [0.01, 0.01]);
  assert.equal(figures.tax, 0.02);
  assert.equal(figures.cgst + figures.sgst, 0.02);
});

test('GST reconciliation matches invoice figures to the order ledger', function () {
  var db = {
    orders: [{
      id: 9,
      date: '2026-01-01',
      customer: 'In-memory customer',
      items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
      subtotal: 100,
      discount: 0,
      tax: 5,
      total: 105
    }]
  };
  var reconciliation = reports.getGstReconciliation(db);

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.equal(reconciliation.rows[0].invoiceTax, 5);
  assert.equal(reconciliation.rows[0].invoiceTotal, 105);
  assert.equal(reconciliation.rows[0].delta, 0);
  assert.equal(reconciliation.rows[0].matched, true);
});
