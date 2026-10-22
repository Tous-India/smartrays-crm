// The WhatsApp message a staff member sends with a customer's complaint link —
// plain English plus one Hindi line (ComplaintLinkButton).
export function complaintWhatsAppText(customerName, url) {
  return [
    `Hello ${customerName},`,
    "If anything is wrong with your Smartrays solar system, or you have a billing question, tell us here — no login needed:",
    url,
    "You can open the same link later to see the status.",
    "",
    "किसी भी समस्या के लिए इस लिंक पर बताइए। स्थिति देखने के लिए यही लिंक फिर खोलें।",
  ].join("\n");
}
