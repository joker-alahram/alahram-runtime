import { buildWhatsAppMessage } from './transportRuntime.js';
import { buildInvoiceViewModel } from './invoiceViewModel.js';

export { buildWhatsAppMessage };

export function buildWhatsAppMessageFromOrder({ order, items, session, activeVisit }) {
  const vm = buildInvoiceViewModel({ order, items, session, activeVisit });
  return buildWhatsAppMessage(vm);
}
