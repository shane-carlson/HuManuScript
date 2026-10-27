// Public Polar identifiers. These are not secrets — they ship in the app.
// Never put an organization access token, or a signing secret for webhooks,
// in this file, the renderer, or any other client code.

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const organizationId = trim(process.env.POLAR_ORGANIZATION_ID) || 'cfd3c2a6-2654-4565-8c15-e8ca7d25bff6';
const productId = trim(process.env.POLAR_PRODUCT_ID) || '6488b14c-d63a-4814-b29f-c9ba42ec132f';
/** License Keys benefit on that product. Rejects a key from a different benefit. */
const benefitId = trim(process.env.POLAR_BENEFIT_ID) || '0bc31d71-a7a8-413b-9e43-a6a8262f63f2';
const checkoutUrl =
  trim(process.env.POLAR_CHECKOUT_URL) ||
  'https://buy.polar.sh/polar_cl_eIHOifn9kcCTQijdu9kyp7anFWbu9kqVqEIke2EDeo8';
const server = process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production';

function apiBase() {
  return server === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
}

function isConfigured() {
  return Boolean(organizationId && productId && checkoutUrl);
}

module.exports = {
  organizationId,
  productId,
  benefitId,
  checkoutUrl,
  server,
  apiBase,
  isConfigured,
};
