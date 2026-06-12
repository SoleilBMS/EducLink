class EmailServiceError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message);
    this.name = 'EmailServiceError';
    this.status = status ?? null;
    this.code = code ?? null;
    if (cause) this.cause = cause;
  }
}

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;

class EmailService {
  constructor({ apiKey, fromAddress, fromName = 'EducLink', logger, fetch = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.apiKey = apiKey ?? null;
    this.fromAddress = fromAddress ?? null;
    this.fromName = fromName;
    this.logger = logger;
    this.fetch = fetch;
    this.timeoutMs = timeoutMs;

    if (this.apiKey && !this.fromAddress) {
      throw new EmailServiceError('EmailService requires fromAddress when apiKey is set', { code: 'invalid_config' });
    }
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  async send({ to, subject, html, text }) {
    if (!this.apiKey) {
      this.logger?.info?.('[email] no-op (RESEND_API_KEY not configured)', { to, subject });
      return { skipped: true };
    }

    const fromLine = `${this.fromName} <${this.fromAddress}>`;
    const body = JSON.stringify({
      from: fromLine,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: controller.signal
      });
    } catch (err) {
      throw new EmailServiceError('Network error calling Resend', { code: 'network_error', cause: err });
    } finally {
      clearTimeout(timeoutId);
    }

    let parsed = {};
    try { parsed = await response.json(); } catch { parsed = {}; }

    if (!response.ok) {
      const message = (parsed && parsed.message) || `Resend returned HTTP ${response.status}`;
      throw new EmailServiceError(message, { status: response.status, code: 'api_error' });
    }

    return { id: parsed.id ?? null };
  }

  async sendBatch({ recipients, subject, html, text }) {
    const errors = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.send({ to: recipient, subject, html, text });
        if (result.skipped) continue;
        sent += 1;
      } catch (err) {
        failed += 1;
        errors.push({ recipient, error: err.message, status: err.status ?? null });
        this.logger?.warn?.('[email] sendBatch recipient failed', { recipient, error: err.message });
      }
    }

    return { sent, failed, errors };
  }
}

module.exports = { EmailService, EmailServiceError };
