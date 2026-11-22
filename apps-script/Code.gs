/**
 * Portfolio contact notifications (Google Apps Script).
 *
 * Your website's Worker sends every new contact-form message here, and this script emails it to you.
 * Messages are ALSO saved in your admin panel, so nothing is lost if an email doesn't arrive.
 *
 * Setup (details in DEPLOY.md, "Contact form emails"):
 *   1. script.google.com > New project > paste this whole file (replace everything).
 *   2. Project Settings (gear icon) > Script properties > Add:  SECRET = <the secret printed by "npm run contact">
 *   3. Run the function "authorize" once (Run button) and accept the permission screen.
 *   4. Deploy > New deployment > type "Web app" > Execute as: Me > Who has access: Anyone > Deploy.
 *   5. Copy the Web app URL (ends in /exec) and give it to "npm run contact".
 * After editing this code later: Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 */

const OWNER_EMAIL = 'qasim.datadev@gmail.com';     // where notifications are sent

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || data.secret !== secret) return reply_('forbidden');          // anyone can reach a web app URL; only your Worker knows the secret

    const one = s => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    const name = one(data.name) || 'Someone';
    const email = one(data.email);
    const where = [one(data.city), one(data.country)].filter(Boolean).join(', ');

    const lines = [
      (data.test ? 'This is a TEST from your portfolio admin panel.\n' : 'New message from your portfolio:\n'),
      'Name:    ' + name,
      'Email:   ' + email,
      where ? 'Where:   ' + where : null,
      data.page ? 'Page:    ' + one(data.page) : null,
      'Time:    ' + one(data.time),
      '',
      String(data.message == null ? '' : data.message).slice(0, 2500),
      '',
      '— Reply to this email to answer ' + name + ' directly. All messages are also in your admin panel (Messages tab).'
    ].filter(l => l !== null);

    MailApp.sendEmail({
      to: OWNER_EMAIL,
      replyTo: email,                                                           // hitting "Reply" writes to the visitor
      subject: (data.test ? 'TEST: ' : 'Portfolio message from ') + name,
      body: lines.join('\n'),
      name: 'Portfolio'
    });
    return reply_('ok');
  } catch (err) {
    return reply_('error: ' + err.message);
  }
}

function reply_(text) { return ContentService.createTextOutput(text); }

/** Run this once from the editor so Google asks you to allow sending email. */
function authorize() {
  MailApp.getRemainingDailyQuota();
  Logger.log('Authorised. You can now deploy the web app.');
}
