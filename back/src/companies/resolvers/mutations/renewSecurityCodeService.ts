import { UserInputError } from "apollo-server-express";
import prisma from "../../../prisma";

import { sendMail } from "../../../mailer/mailing";

import { CompanyPrivate } from "../../../generated/graphql/types";

import { randomNumber } from "../../../utils";
import { convertUrls, getCompanyActiveUsers } from "../../database";
import { renderMail } from "../../../mailer/templates/renderers";
import { securityCodeRenewal } from "../../../mailer/templates";

/**
 * This function is used to renew the security code
 * of a company. If the new security code generated is
 * identical to the previous one, we generate a new one
 * @param siret
 */
export async function renewSecurityCodeFn(
  siret: string
): Promise<CompanyPrivate> {
  if (siret.length !== 14) {
    throw new UserInputError("Le siret doit faire 14 caractères", {
      invalidArgs: ["siret"]
    });
  }

  const company = await prisma.company.findUnique({ where: { siret } });

  if (!company) {
    throw new UserInputError(
      "Aucune entreprise enregistré sur Trackdéchets avec ce siret",
      {
        invalidArgs: ["siret"]
      }
    );
  }

  const currentSecurityCode = company.securityCode;

  let newSecurityCode = null;

  while (!newSecurityCode || newSecurityCode === currentSecurityCode) {
    newSecurityCode = randomNumber(4);
  }

  const updatedCompany = await prisma.company.update({
    where: { siret },
    data: {
      securityCode: newSecurityCode
    }
  });

  const users = await getCompanyActiveUsers(siret);
  const recipients = users.map(({ email, name }) => ({ email, name }));

  const mail = renderMail(securityCodeRenewal, {
    to: recipients,
    variables: {
      company: { siret: company.siret, name: company.name }
    }
  });
  sendMail(mail);

  return convertUrls(updatedCompany);
}
