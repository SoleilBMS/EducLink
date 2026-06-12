function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function renderNewPostEmail({ post, author, className, baseUrl, recipientName }) {
  const isBroadcast = post.classRoomId === null;
  const subject = isBroadcast
    ? `\u{1F4F0} Annonce de l'ecole sur EducLink`
    : `\u{1F4F0} Nouveau post de ${author.name} dans ${className}`;
  const postUrl = isBroadcast
    ? `${baseUrl}/class-feed/broadcast#post-${post.id}`
    : `${baseUrl}/class-feed/classes/${post.classRoomId}#post-${post.id}`;
  const bodyPreview = truncate(post.body, 200);

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAFB;font-family:Arial,sans-serif;color:#0F172A;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAFB;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 12px rgba(79,70,229,0.10);">
        <tr><td style="background:linear-gradient(120deg,#4F46E5,#7C3AED);padding:24px;color:#fff;">
          <h1 style="margin:0;font-size:22px;font-weight:800;">\u{1F4F0} Nouveau post sur EducLink</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 16px;color:#64748B;">Bonjour ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 16px;"><strong>${escapeHtml(author.name)}</strong>${isBroadcast ? ` a publié une annonce pour toute l’école` : ` a publié un nouveau post dans <strong>${escapeHtml(className)}</strong>`}.</p>
          <div style="background:#F4F4F8;border-radius:12px;padding:16px;margin-bottom:24px;border-left:4px solid #4F46E5;">
            <p style="margin:0;white-space:pre-wrap;">${escapeHtml(bodyPreview)}</p>
          </div>
          <p style="text-align:center;margin:0;">
            <a href="${escapeHtml(postUrl)}" style="display:inline-block;background:linear-gradient(120deg,#4F46E5,#7C3AED);color:#fff;padding:12px 32px;border-radius:14px;text-decoration:none;font-weight:700;">Voir le post</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;color:#94A3B8;font-size:12px;text-align:center;">
          Vous recevez cet email parce que vous êtes parent ${isBroadcast ? `d’un élève de l’école` : `d’un élève en ${escapeHtml(className)}`} sur EducLink.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `Bonjour ${recipientName},

${author.name}${isBroadcast ? ` a publié une annonce pour toute l’école` : ` a publié un nouveau post dans ${className}`}.

${bodyPreview}

Voir le post : ${postUrl}

— EducLink`;

  return { subject, html, text };
}

module.exports = { renderNewPostEmail };
