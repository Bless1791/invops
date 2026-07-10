exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.warn('RESEND_API_KEY not set');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sent: false, reason: 'not_configured' }) };
  }

  try {
    const { type, to, data = {} } = JSON.parse(event.body || '{}');
    if (!to || !type) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing to or type' }) };

    const org = data.org || 'InvOps';
    const recipients = Array.isArray(to) ? to : [to];

    const tpl = {
      request_submitted: {
        subject: `[${org}] New Request ${data.requestId} — ${data.department}`,
        html: `<h2>📋 New Inventory Request</h2>
<p><b>Request ID:</b> ${data.requestId}</p>
<p><b>Submitted By:</b> ${data.requestedByName}</p>
<p><b>Department:</b> ${data.department}</p>
<p><b>Purpose:</b> ${data.purpose}</p>
<p><b>Priority:</b> ${data.priority}</p>
<p><b>Items:</b> ${data.itemSummary}</p>
<p><b>Date:</b> ${data.date}</p>
<br><p>Please log in to InvOps to review and approve this request.</p>`
      },
      request_approved_l1: {
        subject: `[${org}] Request ${data.requestId} — Approved at L1`,
        html: `<h2>✅ Request Approved (L1)</h2>
<p>Your request <b>${data.requestId}</b> has been approved at Level 1 and is now awaiting final approval.</p>
<p><b>Approved By:</b> ${data.approvedBy}</p>
${data.comment ? `<p><b>Comment:</b> ${data.comment}</p>` : ''}
<br><p>You will be notified when final approval is granted.</p>`
      },
      request_approved_final: {
        subject: `[${org}] Request ${data.requestId} — Fully Approved`,
        html: `<h2>✅ Request Fully Approved</h2>
<p>Your request <b>${data.requestId}</b> has received final approval and is ready for disbursement.</p>
<p><b>Approved By:</b> ${data.approvedBy}</p>
${data.comment ? `<p><b>Comment:</b> ${data.comment}</p>` : ''}
<br><p>The store team will process your items shortly.</p>`
      },
      request_rejected: {
        subject: `[${org}] Request ${data.requestId} — Rejected`,
        html: `<h2>❌ Request Rejected</h2>
<p>Your request <b>${data.requestId}</b> has been rejected.</p>
<p><b>Rejected By:</b> ${data.rejectedBy}</p>
<p><b>Reason:</b> ${data.comment || 'No reason provided'}</p>
<br><p>You may submit a revised request if appropriate.</p>`
      },
      request_disbursed: {
        subject: `[${org}] Request ${data.requestId} — Items Disbursed`,
        html: `<h2>📤 Items Disbursed</h2>
<p>The items for your request <b>${data.requestId}</b> have been disbursed.</p>
<p><b>Disbursed By:</b> ${data.disbursedBy}</p>
<p><b>Date:</b> ${data.date}</p>
<p><b>Items:</b> ${data.itemSummary}</p>
${data.note ? `<p><b>Note:</b> ${data.note}</p>` : ''}`
      },
      stock_alert: {
        subject: `[${org}] ⚠️ Stock Alert — ${data.criticalCount} critical, ${data.lowCount} low`,
        html: `<h2>⚠️ Inventory Stock Alert</h2>
<p>The following stock levels require immediate attention:</p>
<p><b>Critical / Out of Stock:</b> ${data.criticalCount} items</p>
<p><b>Low Stock:</b> ${data.lowCount} items</p>
<br><p>Please log in to InvOps to review and arrange restocking.</p>`
      },
      new_user_welcome: {
        subject: `[${org}] Welcome to InvOps — Your Account is Ready`,
        html: `<h2>👋 Welcome to InvOps!</h2>
<p>Your account has been created by the system administrator.</p>
<p><b>Email:</b> ${data.email}</p>
<p><b>Role:</b> ${data.role}</p>
<br><p>Please sign in at your InvOps site and change your password as soon as possible.</p>`
      }
    };

    const tmpl = tpl[type] || {
      subject: `[${org}] System Notification`,
      html: `<p>${JSON.stringify(data)}</p>`
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${org} <onboarding@resend.dev>`,
        to: recipients,
        subject: tmpl.subject,
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1E293B">
<div style="background:#0D9488;padding:16px 20px;border-radius:8px 8px 0 0">
  <span style="color:#fff;font-size:18px;font-weight:bold">📦 ${org}</span>
  <span style="color:rgba(255,255,255,0.7);font-size:12px;margin-left:10px">Inventory Management System</span>
</div>
<div style="background:#fff;border:1px solid #E3E8F0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
${tmpl.html}
</div>
<p style="font-size:11px;color:#94A3B8;margin-top:12px;text-align:center">This is an automated notification from ${org} InvOps. Do not reply.</p>
</body></html>`
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message || JSON.stringify(result));

    console.log(`Email sent [${type}] to ${recipients.join(', ')}`);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sent: true, id: result.id }) };

  } catch (err) {
    console.error('Email error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
