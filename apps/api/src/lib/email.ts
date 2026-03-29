// ---------------------------------------------------------------------------
// Email notification service — SendGrid in production, console log in dev
// ---------------------------------------------------------------------------

interface QuoteNotificationParams {
  contractorEmail: string
  contractorName: string
  customerName: string
  jobSiteAddress: string
  budgetRange: string
  quoteId: string
}

interface SendGridMailBody {
  personalizations: { to: { email: string }[] }[]
  from: { email: string; name: string }
  subject: string
  content: { type: string; value: string }[]
}

/**
 * Send a new-quote notification email to the contractor.
 *
 * When SENDGRID_API_KEY is not set (dev mode), logs the email to console
 * instead of sending.
 */
export async function sendNewQuoteNotification(
  params: QuoteNotificationParams,
  sendgridApiKey: string | undefined
): Promise<void> {
  const { contractorEmail, contractorName, customerName, jobSiteAddress, budgetRange, quoteId } = params

  const subject = `New quote request from ${customerName}`
  const portalLink = `https://app.contractorquote.com/quotes/${quoteId}`

  const body = [
    `Hi ${contractorName},`,
    "",
    `You have a new quote request:`,
    "",
    `  Customer: ${customerName}`,
    `  Address: ${jobSiteAddress}`,
    `  Budget: ${budgetRange}`,
    "",
    `View details in your admin portal:`,
    portalLink,
    "",
    "— Contractor Quote",
  ].join("\n")

  if (!sendgridApiKey) {
    console.warn("=== EMAIL NOTIFICATION (dev mode — no SENDGRID_API_KEY) ===")
    console.warn(`To: ${contractorEmail}`)
    console.warn(`Subject: ${subject}`)
    console.warn(body)
    console.warn("=== END EMAIL ===")
    return
  }

  const mail: SendGridMailBody = {
    personalizations: [{ to: [{ email: contractorEmail }] }],
    from: { email: "noreply@contractorquote.com", name: "Contractor Quote" },
    subject,
    content: [{ type: "text/plain", value: body }],
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mail),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`SendGrid API error (${res.status}): ${text}`)
  }
}
