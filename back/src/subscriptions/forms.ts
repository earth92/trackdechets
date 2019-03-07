import { FormSubscriptionPayload, prisma } from "../generated/prisma-client";
import { sendMail } from "../common/mails.helper";
import { userMails } from "../users/mails";

export function formsSubscriptionCallback(payload: FormSubscriptionPayload) {
  mailToInexistantRecipient(payload);
}

async function mailToInexistantRecipient(payload: FormSubscriptionPayload) {
  const previousRecipientSiret = payload.previousValues.recipientCompanySiret;
  const recipientSiret = payload.node.recipientCompanySiret;
  const recipientMail = payload.node.recipientCompanyMail;
  const recipientName =
    payload.node.recipientCompanyName || "Monsieur / Madame";

  if (
    !recipientSiret ||
    !recipientMail ||
    previousRecipientSiret === recipientSiret
  ) {
    return;
  }

  const companyExists = await prisma.$exists.company({ siret: recipientSiret });

  if (companyExists) {
    return;
  }

  return sendMail(userMails.contentAwaitsGuest(recipientMail, recipientName));
}
