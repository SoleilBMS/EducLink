const Busboy = require('busboy');

const { buildValidationError } = require('../modules/error-utils');

const DEFAULT_MAX_FIELDS = 20;
const DEFAULT_MAX_FIELD_SIZE = 1024 * 64; // 64 KB per field
const DEFAULT_MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

function parseMultipart(request, {
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  allowedMimeTypes = null,
  maxFields = DEFAULT_MAX_FIELDS,
  maxFieldSize = DEFAULT_MAX_FIELD_SIZE
} = {}) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return Promise.reject(buildValidationError('Content-Type must be multipart/form-data'));
  }

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: request.headers,
        limits: {
          fileSize: maxFileSize,
          files: 1,
          fields: maxFields,
          fieldSize: maxFieldSize
        }
      });
    } catch (error) {
      reject(buildValidationError(`Invalid multipart payload: ${error.message}`));
      return;
    }

    const fields = new Map();
    let file = null;
    let settled = false;
    const chunks = [];
    let fileSize = 0;
    let fileTruncated = false;
    let extraFileDetected = false;

    const finish = (action) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        request.unpipe?.(busboy);
      } catch {
        // ignore
      }
      action();
    };

    busboy.on('field', (name, value) => {
      if (settled) {
        return;
      }
      // last-write wins for repeated fields (matches URLSearchParams semantics)
      fields.set(name, value);
    });

    busboy.on('file', (name, stream, info) => {
      if (settled) {
        stream.resume();
        return;
      }

      if (file !== null) {
        extraFileDetected = true;
        stream.resume();
        finish(() => reject(buildValidationError('Only one file upload is allowed per request')));
        return;
      }

      const mimeType = info?.mimeType || info?.mime || '';
      const fileName = info?.filename || '';
      if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
        stream.resume();
        finish(() => reject(buildValidationError(
          `File mime type "${mimeType}" not allowed (allowed: ${allowedMimeTypes.join(', ')})`
        )));
        return;
      }

      stream.on('data', (chunk) => {
        if (settled) {
          return;
        }
        chunks.push(chunk);
        fileSize += chunk.length;
      });

      stream.on('limit', () => {
        fileTruncated = true;
        finish(() => reject(buildValidationError(
          `File too large (limit ${maxFileSize} bytes)`
        )));
      });

      stream.on('end', () => {
        if (settled || fileTruncated || extraFileDetected) {
          return;
        }
        if (!fileName || fileSize === 0) {
          // Empty file input → treat as no file
          file = null;
          return;
        }
        file = {
          fileName,
          mimeType,
          data: Buffer.concat(chunks, fileSize),
          size: fileSize
        };
      });
    });

    busboy.on('filesLimit', () => {
      extraFileDetected = true;
      finish(() => reject(buildValidationError('Only one file upload is allowed per request')));
    });

    busboy.on('partsLimit', () => {
      finish(() => reject(buildValidationError(`Too many form parts (limit ${maxFields})`)));
    });

    busboy.on('fieldsLimit', () => {
      finish(() => reject(buildValidationError(`Too many form fields (limit ${maxFields})`)));
    });

    busboy.on('error', (err) => {
      finish(() => reject(buildValidationError(`Multipart parse error: ${err.message}`)));
    });

    busboy.on('close', () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ fields, file });
    });

    request.on('error', (err) => {
      finish(() => reject(buildValidationError(`Request error: ${err.message}`)));
    });

    request.pipe(busboy);
  });
}

module.exports = {
  parseMultipart,
  DEFAULT_MAX_FIELDS,
  DEFAULT_MAX_FILE_SIZE
};
