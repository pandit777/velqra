const PDFDocument = require('pdfkit');

const pdfText = value => String(value ?? '')
  .replace(/\u20b9/g, 'INR ')
  .replace(/[^\x20-\x7E]/g, '?');

const formatAmount = value => `INR ${Number(value || 0).toFixed(2)}`;

const generateInvoicePdf = order => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const chunks = [];

  document.on('data', chunk => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);

  const left = document.page.margins.left;
  const right = document.page.width - document.page.margins.right;
  const descriptionWidth = 250;
  const quantityX = left + 270;
  const unitPriceX = left + 325;
  const amountX = left + 405;
  const itemRows = Array.isArray(order.items)
    ? order.items.filter(item => item && typeof item === 'object')
    : [];
  const subtotal = itemRows.reduce((sum, item) => {
    return sum + (Number(item.price) || 0) * (Number(item.qty) || 0);
  }, 0);
  const total = Number(order.total) || 0;
  const deliveryCharge = Math.max(0, total - subtotal);
  const discount = Math.max(0, subtotal - total);
  const deliveredEvent = [...(Array.isArray(order.status_history) ? order.status_history : [])]
    .reverse()
    .find(event => event?.status === 'Delivered');
  const deliveredAt = deliveredEvent?.timestamp || order.updated_at || order.created_at;
  const deliveredDate = new Date(deliveredAt);
  const invoiceDate = Number.isNaN(deliveredDate.getTime())
    ? 'N/A'
    : deliveredDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const drawTableHeader = () => {
    const y = document.y;
    document.rect(left, y, right - left, 24).fill('#173b32');
    document.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    document.text('ITEM', left + 8, y + 7, { width: descriptionWidth - 8 });
    document.text('QTY', quantityX, y + 7, { width: 35, align: 'right' });
    document.text('UNIT PRICE', unitPriceX, y + 7, { width: 70, align: 'right' });
    document.text('AMOUNT', amountX, y + 7, { width: right - amountX - 8, align: 'right' });
    document.y = y + 24;
  };

  document.font('Helvetica-Bold').fontSize(22).fillColor('#173b32')
    .text('VELQRA', left, 48, { continued: true });
  document.font('Helvetica').fontSize(10).fillColor('#475569')
    .text('    DELIVERY RECEIPT', { align: 'right' });
  document.moveTo(left, 82).lineTo(right, 82).strokeColor('#cbd5e1').stroke();

  document.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
    .text('Invoice details', left, 98);
  document.font('Helvetica').fontSize(9).fillColor('#334155');
  document.text(`Invoice no: VELQRA-${pdfText(order.id)}`, left, 118);
  document.text(`Delivered: ${invoiceDate}`, left, 133);
  document.text(`Order status: ${pdfText(order.status)}`, left, 148);
  document.text(`Payment: ${String(order.payment_method || 'cod').toUpperCase()}`, left, 163);

  const delivery = order.delivery || {};
  const addressLines = [
    delivery.fullName,
    delivery.address,
    delivery.landmark,
    [delivery.city, delivery.state].filter(Boolean).join(', '),
    delivery.pincode,
    delivery.phone
  ].filter(Boolean).map(pdfText);
  document.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
    .text('Delivered to', left + 265, 98);
  document.font('Helvetica').fontSize(9).fillColor('#334155')
    .text(addressLines.join('\n') || 'Customer', left + 265, 118, { width: right - left - 265 });

  document.y = Math.max(document.y, 205);
  document.moveDown(0.7);
  drawTableHeader();

  document.font('Helvetica').fontSize(9).fillColor('#0f172a');
  for (const item of itemRows) {
    const name = pdfText(item.name || 'Item');
    const rowHeight = Math.max(
      26,
      document.heightOfString(name, { width: descriptionWidth - 12 }) + 12
    );

    if (document.y + rowHeight > document.page.height - document.page.margins.bottom - 105) {
      document.addPage();
      document.font('Helvetica-Bold').fontSize(12).fillColor('#173b32')
        .text('VELQRA - DELIVERY RECEIPT', left, 40);
      document.y = 65;
      drawTableHeader();
      document.font('Helvetica').fontSize(9).fillColor('#0f172a');
    }

    const y = document.y + 7;
    const quantity = Number(item.qty) || 0;
    const unitPrice = Number(item.price) || 0;
    const lineTotal = quantity * unitPrice;

    document.text(name, left + 8, y, { width: descriptionWidth - 12 });
    document.text(String(quantity), quantityX, y, { width: 35, align: 'right' });
    document.text(formatAmount(unitPrice), unitPriceX, y, { width: 70, align: 'right' });
    document.text(formatAmount(lineTotal), amountX, y, { width: right - amountX - 8, align: 'right' });
    document.moveTo(left, document.y + rowHeight).lineTo(right, document.y + rowHeight)
      .strokeColor('#e2e8f0').stroke();
    document.y += rowHeight;
  }

  const totalsHeight = discount ? 94 : 74;
  if (document.y + totalsHeight > document.page.height - document.page.margins.bottom) {
    document.addPage();
  }

  const totalsX = right - 190;
  document.moveDown(0.8);
  document.font('Helvetica').fontSize(9).fillColor('#334155');
  document.text(`Items subtotal: ${formatAmount(subtotal)}`, totalsX, document.y, { width: 190, align: 'right' });
  document.moveDown(0.4);
  if (discount > 0) {
    document.text(`Discount: -${formatAmount(discount)}`, totalsX, document.y, { width: 190, align: 'right' });
    document.moveDown(0.4);
  }
  document.text(`Delivery: ${formatAmount(deliveryCharge)}`, totalsX, document.y, { width: 190, align: 'right' });
  document.moveDown(0.6);
  document.font('Helvetica-Bold').fontSize(12).fillColor('#173b32');
  document.text(`TOTAL: ${formatAmount(total)}`, totalsX, document.y, { width: 190, align: 'right' });

  document.moveDown(2);
  document.font('Helvetica').fontSize(8).fillColor('#64748b');
  document.text('This is a delivery receipt, not a GST tax invoice.', left, document.y, {
    width: right - left,
    align: 'center'
  });
  document.end();
});

module.exports = { generateInvoicePdf };
