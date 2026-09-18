import nodemailer from 'nodemailer';

let cachedTransporter = null;
let isEthereal = false;

export const emailDeliveryHistory = [];
export const clearEmailHistory = () => {
  emailDeliveryHistory.length = 0;
};

const getTransporter = async () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // 0. Test environment uses in-memory JSON transport to avoid external network calls
  if (process.env.NODE_ENV === 'test') {
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    isEthereal = false;
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const service = process.env.EMAIL_SERVICE;

  // 1. If real credentials are provided in server/.env, use real SMTP/Gmail
  if (user && pass) {
    const cleanPass = pass.replace(/\s+/g, '');
    if (service === 'gmail' || user.endsWith('@gmail.com') || host?.includes('gmail')) {
      cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: cleanPass },
      });
      isEthereal = false;
      console.log(`[Email Service] Configured real Gmail delivery for: ${user}`);
    } else {
      cachedTransporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user, pass: cleanPass },
      });
      isEthereal = false;
      console.log(`[Email Service] Configured SMTP delivery (${host}:${port}) for: ${user}`);
    }
    return cachedTransporter;
  }

  // 2. If credentials are not yet set, fall back to Ethereal without crashing the server
  console.warn(
    '[Email Service] ⚠️ Notice: Real delivery is inactive because SMTP_USER and SMTP_PASS are empty in server/.env.'
  );
  console.warn('[Email Service] Using virtual Ethereal mailer for this request. (No real email will be sent).');

  const testAccount = await nodemailer.createTestAccount();
  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  isEthereal = true;
  return cachedTransporter;
};

export const sendPasswordResetOTP = async (toEmail, otp) => {
  try {
    const transporter = await getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '"CollabBoard Support" <noreply@collabboard.com>';

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: 'CollabBoard - Your 6-Digit Password Reset Code',
      text: `Your password reset code is: ${otp}. It will expire in 10 minutes. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">CollabBoard Password Reset</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Use the verification code below to complete your password reset.</p>
          </div>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #2563eb;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
            This code expires in <strong>10 minutes</strong>. If you did not request a password reset, you can safely disregard this email.
          </p>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
            <small style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} CollabBoard. Real-Time Team Collaboration.</small>
          </div>
        </div>
      `,
    });

    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Service] Virtual Ethereal Preview link: ${previewUrl}`);
    } else {
      console.log(`[Email Service] ✅ Real email sent successfully to: ${toEmail} (MessageId: ${info.messageId})`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: isEthereal ? nodemailer.getTestMessageUrl(info) : null,
    };
  } catch (error) {
    console.error(`[Email Service Error] Failed to send email to ${toEmail}:`, error.message);
    throw error;
  }
};

export const sendWorkspaceInviteEmail = async (toEmail, inviterName, workspaceName, role) => {
  try {
    const transporter = await getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '"CollabBoard Support" <noreply@collabboard.com>';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: `CollabBoard - You've been invited to "${workspaceName}"`,
      text: `${inviterName} has invited you to join "${workspaceName}" on CollabBoard as a ${role}. Sign in at ${clientUrl}/login to access your team workspace.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">Workspace Invitation</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">You have been invited to collaborate with your team.</p>
          </div>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #334155;">
              <strong>${inviterName}</strong> invited you to join:
            </p>
            <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 20px;">${workspaceName}</h3>
            <span style="display: inline-block; padding: 4px 12px; background-color: #e0f2fe; color: #0369a1; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
              Role: ${role}
            </span>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${clientUrl}/dashboard" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Go to Workspace
            </a>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
            <small style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} CollabBoard. Real-Time Team Collaboration.</small>
          </div>
        </div>
      `,
    });

    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Service] Virtual Ethereal Invite link: ${previewUrl}`);
    } else {
      console.log(`[Email Service] ✅ Real invite email sent successfully to: ${toEmail} (MessageId: ${info.messageId})`);
    }

    emailDeliveryHistory.push({
      type: 'workspace_invite',
      toEmail,
      inviterName,
      workspaceName,
      role,
      timestamp: Date.now(),
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: isEthereal ? nodemailer.getTestMessageUrl(info) : null,
    };
  } catch (error) {
    console.error(`[Email Service Error] Failed to send workspace invite email to ${toEmail}:`, error.message);
    throw error;
  }
};

export const sendTaskAssignmentEmail = async ({
  toEmail,
  assigneeName,
  assignerName,
  taskTitle,
  projectName,
  taskId,
  projectId,
}) => {
  try {
    const transporter = await getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '"CollabBoard Support" <noreply@collabboard.com>';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const destinationUrl = projectId ? `${clientUrl}/projects/${projectId}` : `${clientUrl}/dashboard`;

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: `CollabBoard - Assigned to "${taskTitle}" in "${projectName}"`,
      text: `${assignerName || 'A team member'} assigned you to "${taskTitle}" in project "${projectName}". Open your board to view: ${destinationUrl}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px;">New Task Assignment</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">You have been assigned to collaborate on a task.</p>
          </div>
          <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #334155;">
              <strong>${assignerName || 'A team member'}</strong> assigned you to:
            </p>
            <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 20px;">${taskTitle}</h3>
            <span style="display: inline-block; padding: 4px 12px; background-color: #e0e7ff; color: #4338ca; border-radius: 9999px; font-size: 12px; font-weight: 600;">
              Project: ${projectName}
            </span>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${destinationUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              View Task
            </a>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center;">
            <small style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} CollabBoard. Real-Time Team Collaboration.</small>
          </div>
        </div>
      `,
    });

    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Service] Virtual Ethereal Assignment link: ${previewUrl}`);
    } else {
      console.log(`[Email Service] ✅ Real assignment email sent successfully to: ${toEmail} (MessageId: ${info.messageId})`);
    }

    emailDeliveryHistory.push({
      type: 'task_assignment',
      toEmail,
      assigneeName,
      assignerName,
      taskTitle,
      projectName,
      taskId,
      projectId,
      timestamp: Date.now(),
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: isEthereal ? nodemailer.getTestMessageUrl(info) : null,
    };
  } catch (error) {
    console.error(`[Email Service Error] Failed to send assignment email to ${toEmail}:`, error.message);
    throw error;
  }
};

/**
 * Generic email dispatcher honoring the sendEmail({ to, subject, html, text }) signature.
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = await getTransporter();
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '"CollabBoard Support" <noreply@collabboard.com>';

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || '',
      html,
    });

    if (isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[Email Service] Virtual Ethereal Preview link: ${previewUrl}`);
    } else {
      console.log(`[Email Service] ✅ Real email sent successfully to: ${to} (MessageId: ${info.messageId})`);
    }

    emailDeliveryHistory.push({
      type: 'generic_email',
      toEmail: to,
      subject,
      timestamp: Date.now(),
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: isEthereal ? nodemailer.getTestMessageUrl(info) : null,
    };
  } catch (error) {
    console.error(`[Email Service Error] Failed to send email to ${to}:`, error.message);
    throw error;
  }
};

