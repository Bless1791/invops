/**
 * InvOps — Email Alert Function
 * POST /.netlify/functions/send-email
 *
 * Environment variables needed in Netlify:
 *   SMTP_HOST      e.g. smtp.gmail.com  (or smtp.sendgrid.net)
 *   SMTP_PORT      e.g. 587
 *   SMTP_SECURE    true if port 465, false otherwise
 *   SMTP_USER      your SMTP login email
 *   SMTP_PASS      your SMTP password / app password
 *   FROM_EMAIL     e.g. noreply@yourcompany.com
 *   FROM_NAME      e.g. InvOps System  (optional)
 *
 * Body (JSON):
 *   type    — alert type key (see TEMPLATES below)
 *   to      — string or array of email addresses
 *   data    — object with template variables
 */

const nodemailer = require('nodemailer');

// ── EMAIL TEMPLATES ──────────────────────────────────────────────────────────
const BRAND = '#0D9488';
const header = (org) => `
<div style="background:${BRAND};padding:18px 24px;border-radius:8px 8px 0 0">
  <span style="color:#fff;font-size:17px;font-weight:800;font-family:Arial,sans-serif">📦 ${org || 'InvOps'}</span>
  <span style="color:rgba(255,255,255,.65);font-size:11px;font-family:Arial,sans-serif;margin-left:10px">Inventory Management System</span>
</div>`;
const footer = () => `
<div style="padding:14px 24px;background:#F7F9FC;border-top:1px solid #E3E8F0;border-radius:0 0 8px 8px;color:#94A3B8;font-size:11px;font-family:Arial,sans-serif">
  This is an automated notification from InvOps. Do not reply to this email.
</div>`;
const wrap = (org, body) => `
<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#EEF2F7;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #E3E8F0;overflow:hidden">
  ${header(org)}
  <div style="padding:22px 24px">${body}</div>
  ${footer()}
</div></body></html>`;

const h2 = (t) => `<h2 style="color:#0F172A;font-size:16px;margin:0 0 12px">${t}</h2>`;
const p  = (t) => `<p style="color:#374151;font-size:13px;line-height:1.6;margin:0 0 10px">${t}</p>`;
const kv = (k,v) => `<tr><td style="padding:6px 12px;color:#64748B;font-size:12px;border-bottom:1px solid #F1F5F9">${k}</td><td style="padding:6px 12px;font-size:12px;font-weight:600;color:#0F172A;border-bottom:1px solid #F1F5F9">${v}</td></tr>`;
const table = (rows) => `<table style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #E3E8F0;border-radius:6px;overflow:hidden">${rows}</table>`;
const badge = (text, color) => `<span style="background:${color}22;color:${color};padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700">${text}</span>`;
const btn = (text, url) => url
  ? `<a href="${url}" style="display:inline-block;margin-top:14px;background:${BRAND};color:#fff;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none">${text}</a>`
  : '';

const PRIORITY_COLOR = { Urgent:'#EF4444', High:'#F59E0B', Normal:'#0D9488', Low:'#94A3B8' };
const STATUS_COLOR   = { 'Pending L1':'#F59E0B','Pending L2':'#3B82F6','Approved':'#10B981','Disbursed':'#7C3AED','Rejected':'#EF4444' };

function buildTemplate(type, d) {
  const org = d.org || 'InvOps';
  switch (type) {

    case 'request_submitted':
      return {
        subject: `[${org}] New Request ${d.requestId} — ${d.department}`,
        html: wrap(org, `
          ${h2('📋 New Inventory Request Submitted')}
          ${p(`A new requisition has been submitted and is awaiting your approval.`)}
          ${table(
            kv('Request ID',  d.requestId) +
            kv('Submitted By', d.requestedByName) +
            kv('Department',  d.department) +
            kv('Purpose',     d.purpose) +
            kv('Priority',    badge(d.priority, PRIORITY_COLOR[d.priority]||'#94A3B8')) +
            kv('Items',       d.itemSummary) +
            kv('Date',        d.date)
          )}
          ${p('Please log in to InvOps to review and approve or reject this request.')}
        `)
      };

    case 'request_approved_l1':
      return {
        subject: `[${org}] Request ${d.requestId} — Approved at L1`,
        html: wrap(org, `
          ${h2('✅ Your Request was Approved (L1)')}
          ${p(`Good news! Your inventory request has been approved at the first level and is now pending final approval.`)}
          ${table(
            kv('Request ID', d.requestId) +
            kv('Department', d.department) +
            kv('Approved By', d.approvedBy) +
            kv('Comment',   d.comment||'—') +
            kv('Next Step',  'Awaiting L2 (Final) Approval')
          )}
        `)
      };

    case 'request_approved_final':
      return {
        subject: `[${org}] Request ${d.requestId} — Fully Approved — Ready for Disbursement`,
        html: wrap(org, `
          ${h2('✅ Your Request has been Fully Approved')}
          ${p(`Your inventory request has received final approval and is now ready for disbursement.`)}
          ${table(
            kv('Request ID',  d.requestId) +
            kv('Department',  d.department) +
            kv('Approved By', d.approvedBy) +
            kv('Comment',     d.comment||'—') +
            kv('Status',      badge('Approved', '#10B981'))
          )}
          ${p('The store team will process the disbursement shortly.')}
        `)
      };

    case 'request_rejected':
      return {
        subject: `[${org}] Request ${d.requestId} — Rejected`,
        html: wrap(org, `
          ${h2('❌ Your Request was Rejected')}
          ${p(`Unfortunately your inventory request has been rejected.`)}
          ${table(
            kv('Request ID',  d.requestId) +
            kv('Department',  d.department) +
            kv('Rejected By', d.rejectedBy) +
            kv('Reason',      `<span style="color:#EF4444">${d.comment||'No reason provided'}</span>`) +
            kv('Status',      badge('Rejected','#EF4444'))
          )}
          ${p('You may submit a revised request if appropriate.')}
        `)
      };

    case 'request_disbursed':
      return {
        subject: `[${org}] Request ${d.requestId} — Items Disbursed`,
        html: wrap(org, `
          ${h2('📤 Your Items Have Been Disbursed')}
          ${p(`The approved items for your request have been disbursed from the store.`)}
          ${table(
            kv('Request ID',    d.requestId) +
            kv('Department',    d.department) +
            kv('Disbursed By',  d.disbursedBy) +
            kv('Date',          d.date) +
            kv('Items Issued',  d.itemSummary) +
            kv('Status',        badge('Disbursed','#7C3AED'))
          )}
          ${d.note ? p(`<em>Note: ${d.note}</em>`) : ''}
        `)
      };

    case 'stock_alert':
      return {
        subject: `[${org}] ⚠️ Stock Alert — ${d.criticalCount} critical, ${d.lowCount} low`,
        html: wrap(org, `
          ${h2('⚠️ Inventory Stock Alert')}
          ${p(`The following items require immediate attention:`)}
          ${d.criticalItems && d.criticalItems.length ? `
            <div style="margin:10px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#EF4444;letter-spacing:.5px">Critical / Out of Stock</div>
            ${table(d.criticalItems.map(i => kv(i.name, `<span style="color:#EF4444;font-weight:700">${i.stock} ${i.unit}</span> (min: ${i.min})`)).join(''))}` : ''}
          ${d.lowItems && d.lowItems.length ? `
            <div style="margin:10px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#B45309;letter-spacing:.5px">Low Stock</div>
            ${table(d.lowItems.map(i => kv(i.name, `<span style="color:#B45309;font-weight:700">${i.stock} ${i.unit}</span> (min: ${i.min})`)).join(''))}` : ''}
          ${p('Please arrange restocking as soon as possible.')}
        `)
      };

    case 'new_user_welcome':
      return {
        subject: `[${org}] Welcome to InvOps — Your Account is Ready`,
        html: wrap(org, `
          ${h2('👋 Welcome to InvOps!')}
          ${p(`Your account has been created. Here are your login details:`)}
          ${table(
            kv('Email',    d.email) +
            kv('Password', '<em>Set by your administrator — please change it after first login</em>') +
            kv('Role',     d.role)
          )}
          ${p('Please sign in and change your password as soon as possible.')}
        `)
      };

    default:
      return { subject: `[${org}] System Notification`, html: wrap(org, p(JSON.stringify(d))) };
  }
}

// ── HANDLER ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };

  // If SMTP is not configured, silently succeed (email is optional)
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Netlify env vars');
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: false, reason: 'not_configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { type, to, data = {} } = body;

    if (!to || !type) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing to or type' }) };

    const { subject, html } = buildTemplate(type, data);
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'InvOps'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to: recipients,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    });

    console.log(`Email sent [${type}] to ${recipients}`);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: true }) };

  } catch (err) {
    console.error('Email error:', err.message);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
