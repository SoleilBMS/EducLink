const crypto = require('node:crypto');

const INVOICE_STATUSES = Object.freeze({
  UNPAID: 'unpaid',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid'
});

function buildValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.status = 422;
  return error;
}

function requireString(value, fieldName, min = 1, max = 120) {
  if (typeof value !== 'string') {
    throw buildValidationError(`${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw buildValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  }

  return normalized;
}

function requireDateString(value, fieldName) {
  const normalized = requireString(value, fieldName, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw buildValidationError(`${fieldName} must follow YYYY-MM-DD format`);
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw buildValidationError(`${fieldName} must be a valid date`);
  }

  return normalized;
}

function parsePositiveMoney(value, fieldName) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw buildValidationError(`${fieldName} must be a number`);
  }

  if (parsed < 0) {
    throw buildValidationError(`${fieldName} must be greater than or equal to 0`);
  }

  return Number(parsed.toFixed(2));
}

class FinanceStore {
  constructor({ feePlans = [], invoices = [], payments = [], studentStore, parentStore }) {
    this.feePlans = [...feePlans];
    this.invoices = [...invoices];
    this.payments = [...payments];
    this.studentStore = studentStore;
    this.parentStore = parentStore;
  }

  assertStudentExists(tenantId, studentId) {
    const student = this.studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }
    return student;
  }

  createFeePlan(tenantId, input) {
    const payload = {
      name: requireString(input.name, 'name', 2, 120),
      amountDue: parsePositiveMoney(input.amountDue, 'amountDue'),
      dueDate: requireDateString(input.dueDate, 'dueDate'),
      description: input.description ? requireString(input.description, 'description', 2, 300) : ''
    };

    const now = new Date().toISOString();
    const created = {
      id: `feeplan-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      created_at: now,
      updated_at: now
    };

    this.feePlans.push(created);
    return created;
  }

  listFeePlans(tenantId) {
    return this.feePlans.filter((item) => item.tenant_id === tenantId).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  }

  getFeePlan(tenantId, feePlanId) {
    return this.feePlans.find((item) => item.id === feePlanId && item.tenant_id === tenantId) ?? null;
  }

  createInvoice(tenantId, input) {
    const payload = {
      studentId: requireString(input.studentId, 'studentId', 2, 120),
      feePlanId: input.feePlanId ? requireString(input.feePlanId, 'feePlanId', 2, 120) : null,
      amountDue: parsePositiveMoney(input.amountDue, 'amountDue'),
      dueDate: requireDateString(input.dueDate, 'dueDate'),
      description: input.description ? requireString(input.description, 'description', 2, 300) : ''
    };

    this.assertStudentExists(tenantId, payload.studentId);

    if (payload.feePlanId && !this.getFeePlan(tenantId, payload.feePlanId)) {
      throw buildValidationError('feePlanId must reference an existing fee plan in tenant scope');
    }

    const now = new Date().toISOString();
    const created = {
      id: `invoice-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      created_at: now,
      updated_at: now
    };

    this.invoices.push(created);
    return this.enrichInvoice(created);
  }

  recordPayment(tenantId, input) {
    const payload = {
      invoiceId: requireString(input.invoiceId, 'invoiceId', 2, 120),
      amountPaid: parsePositiveMoney(input.amountPaid, 'amountPaid'),
      paidAt: requireDateString(input.paidAt, 'paidAt'),
      method: input.method ? requireString(input.method, 'method', 2, 80) : 'manual',
      note: input.note ? requireString(input.note, 'note', 1, 300) : ''
    };

    const invoice = this.invoices.find((item) => item.id === payload.invoiceId && item.tenant_id === tenantId);
    if (!invoice) {
      throw buildValidationError('invoiceId must reference an existing invoice in tenant scope');
    }

    if (payload.amountPaid <= 0) {
      throw buildValidationError('amountPaid must be greater than 0');
    }

    const now = new Date().toISOString();
    const created = {
      id: `payment-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      amountPaid: payload.amountPaid,
      paidAt: payload.paidAt,
      method: payload.method,
      note: payload.note,
      created_at: now,
      updated_at: now
    };

    this.payments.push(created);
    return created;
  }

  listInvoices(tenantId) {
    return this.invoices
      .filter((item) => item.tenant_id === tenantId)
      .map((invoice) => this.enrichInvoice(invoice))
      .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  }

  listPayments(tenantId) {
    return this.payments.filter((item) => item.tenant_id === tenantId).sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  }

  listParentFinance(tenantId, parentId) {
    const linkedStudentIds = new Set(this.parentStore.listLinksByParent(tenantId, parentId).map((link) => link.studentId));
    const invoices = this.invoices
      .filter((invoice) => invoice.tenant_id === tenantId && linkedStudentIds.has(invoice.studentId))
      .map((invoice) => this.enrichInvoice(invoice));

    return invoices.sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  }

  summarizeInvoice(invoice) {
    const totalPaid = this.payments
      .filter((payment) => payment.tenant_id === invoice.tenant_id && payment.invoiceId === invoice.id)
      .reduce((sum, payment) => sum + payment.amountPaid, 0);
    const normalizedTotalPaid = Number(totalPaid.toFixed(2));
    const remainingBalance = Number(Math.max(0, invoice.amountDue - normalizedTotalPaid).toFixed(2));

    let status = INVOICE_STATUSES.UNPAID;
    if (normalizedTotalPaid > 0 && remainingBalance > 0) {
      status = INVOICE_STATUSES.PARTIALLY_PAID;
    } else if (remainingBalance === 0) {
      status = INVOICE_STATUSES.PAID;
    }

    return {
      totalPaid: normalizedTotalPaid,
      remainingBalance,
      status
    };
  }

  enrichInvoice(invoice) {
    const summary = this.summarizeInvoice(invoice);
    return {
      ...invoice,
      ...summary
    };
  }
}

module.exports = {
  FinanceStore,
  INVOICE_STATUSES,
  buildValidationError
};
