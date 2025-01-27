import { convertUrls } from "../../../companies/database";
import prisma from "../../../prisma";
import { applyAuthStrategies, AuthType } from "../../../auth";
import { sendMail } from "../../../mailer/mailing";
import { checkIsAuthenticated } from "../../../common/permissions";
import { MutationResolvers } from "../../../generated/graphql/types";
import { getMembershipRequestOrNotFoundError } from "../../database";
import {
  MembershipRequestAlreadyAccepted,
  MembershipRequestAlreadyRefused
} from "../../errors";
import { checkIsCompanyAdmin } from "../../permissions";
import { membershipRequestRefused } from "../../../mailer/templates";
import { renderMail } from "../../../mailer/templates/renderers";

const refuseMembershipRequestResolver: MutationResolvers["refuseMembershipRequest"] =
  async (parent, { id }, context) => {
    applyAuthStrategies(context, [AuthType.Session]);

    const user = checkIsAuthenticated(context);

    // throw error if membership request does not exist
    const membershipRequest = await getMembershipRequestOrNotFoundError({ id });

    const company = await prisma.membershipRequest
      .findUnique({ where: { id: membershipRequest.id } })
      .company();

    // check authenticated user is admin of the company
    await checkIsCompanyAdmin(user, company);

    // throw error if membership request was already accepted
    if (membershipRequest.status === "ACCEPTED") {
      throw new MembershipRequestAlreadyAccepted();
    }

    // throw error if membership request was already refused
    if (membershipRequest.status === "REFUSED") {
      throw new MembershipRequestAlreadyRefused();
    }

    await prisma.membershipRequest.update({
      where: { id },
      data: {
        status: "REFUSED",
        statusUpdatedBy: user.email
      }
    });

    // notify requester of refusal
    const requester = await prisma.membershipRequest
      .findUnique({ where: { id } })
      .user();
    const mail = renderMail(membershipRequestRefused, {
      to: [{ email: requester.email, name: requester.name }],
      variables: { companyName: company.name, companySiret: company.siret }
    });
    await sendMail(mail);

    const dbCompany = await prisma.company.findUnique({
      where: { id: company.id }
    });
    return convertUrls(dbCompany);
  };

export default refuseMembershipRequestResolver;
