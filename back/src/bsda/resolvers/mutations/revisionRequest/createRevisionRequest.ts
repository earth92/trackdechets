import {
  Bsda,
  BsdaStatus,
  Prisma,
  RevisionRequestStatus,
  User
} from "@prisma/client";
import { ForbiddenError, UserInputError } from "apollo-server-express";
import * as yup from "yup";
import { BSDA_WASTE_CODES } from "../../../../common/constants/WASTES";
import { checkIsAuthenticated } from "../../../../common/permissions";
import { INVALID_WASTE_CODE } from "../../../../forms/errors";
import {
  BsdaRevisionRequestContentInput,
  MutationCreateBsdaRevisionRequestArgs
} from "../../../../generated/graphql/types";
import { GraphQLContext } from "../../../../types";
import { getUserCompanies } from "../../../../users/database";
import { flattenBsdaRevisionRequestInput } from "../../../converter";
import { getBsdaOrNotFound } from "../../../database";
import {
  BSDA_REVISION_REQUESTER_FIELDS,
  checkCanRequestRevision
} from "../../../permissions";
import { getBsdaRepository } from "../../../repository";
import { OPERATIONS } from "../../../validation";

export type RevisionRequestContent = Pick<
  Prisma.BsdaRevisionRequestCreateInput,
  | "wasteCode"
  | "wastePop"
  | "packagings"
  | "wasteSealNumbers"
  | "wasteMaterialName"
  | "destinationCap"
  | "destinationReceptionWeight"
  | "destinationOperationCode"
  | "destinationOperationDescription"
  | "brokerCompanyName"
  | "brokerCompanySiret"
  | "brokerCompanyAddress"
  | "brokerCompanyContact"
  | "brokerCompanyPhone"
  | "brokerCompanyMail"
  | "brokerRecepisseNumber"
  | "brokerRecepisseDepartment"
  | "brokerRecepisseValidityLimit"
  | "emitterPickupSiteName"
  | "emitterPickupSiteAddress"
  | "emitterPickupSiteCity"
  | "emitterPickupSitePostalCode"
  | "emitterPickupSiteInfos"
>;

export async function createBsdaRevisionRequest(
  _,
  { input }: MutationCreateBsdaRevisionRequestArgs,
  context: GraphQLContext
) {
  const { bsdaId, content, comment, authoringCompanySiret } = input;

  const user = checkIsAuthenticated(context);
  const bsda = await getBsdaOrNotFound(bsdaId);

  const bsdaRepository = getBsdaRepository(user);

  await checkIfUserCanRequestRevisionOnBsda(user, bsda);
  const authoringCompany = await getAuthoringCompany(
    user,
    bsda,
    authoringCompanySiret
  );
  const approversSirets = await getApproversSirets(
    bsda,
    authoringCompany.siret
  );

  const flatContent = await getFlatContent(content);

  return bsdaRepository.createRevisionRequest({
    bsda: { connect: { id: bsda.id } },
    ...flatContent,
    authoringCompany: { connect: { id: authoringCompany.id } },
    approvals: {
      create: approversSirets.map(approverSiret => ({ approverSiret }))
    },
    comment
  });
}

async function checkIfUserCanRequestRevisionOnBsda(
  user: User,
  bsda: Bsda
): Promise<void> {
  await checkCanRequestRevision(user, bsda);

  if (bsda.status === BsdaStatus.INITIAL) {
    throw new ForbiddenError(
      "Impossible de créer une révision sur ce bordereau. Vous pouvez le modifier directement, aucune signature bloquante n'a encore été apposée."
    );
  }

  if (bsda.status === BsdaStatus.REFUSED || bsda.isDeleted) {
    throw new ForbiddenError(
      "Impossible de créer une révision sur ce bordereau, il a été refusé ou supprimé."
    );
  }

  const unsettledRevisionRequestsOnbsda = await getBsdaRepository(
    user
  ).countRevisionRequests({
    bsdaId: bsda.id,
    status: RevisionRequestStatus.PENDING
  });
  if (unsettledRevisionRequestsOnbsda > 0) {
    throw new ForbiddenError(
      "Impossible de créer une révision sur ce bordereau. Une autre révision est déjà en attente de validation."
    );
  }
}

async function getApproversSirets(bsda: Bsda, authoringCompanySiret: string) {
  // Requesters and approvers are the same persona
  const approversSirets = Object.values(BSDA_REVISION_REQUESTER_FIELDS)
    .map(field => bsda[field])
    .filter(siret => Boolean(siret) && siret !== authoringCompanySiret);

  // Remove duplicates
  return [...new Set(approversSirets)];
}

async function getAuthoringCompany(
  user: Express.User,
  bsda: Bsda,
  authoringCompanySiret: string
) {
  const siretConcernedByRevision = Object.values(
    BSDA_REVISION_REQUESTER_FIELDS
  ).map(field => bsda[field]);

  if (!siretConcernedByRevision.includes(authoringCompanySiret)) {
    throw new UserInputError(
      `Le SIRET "${authoringCompanySiret}" ne peut pas être auteur de la révision. Il n'apparait pas avec un rôle lui donnant ce droit sur le bordereau.`
    );
  }

  const userCompanies = await getUserCompanies(user.id);
  const authoringCompany = userCompanies.find(
    company => company.siret === authoringCompanySiret
  );

  if (!authoringCompany) {
    throw new UserInputError(
      `Vous n'avez pas les droits suffisants pour déclarer le SIRET "${authoringCompanySiret}" comme auteur de la révision.`
    );
  }

  return authoringCompany;
}

async function getFlatContent(
  content: BsdaRevisionRequestContentInput
): Promise<RevisionRequestContent> {
  const flatContent = flattenBsdaRevisionRequestInput(content);

  if (Object.keys(flatContent).length === 0) {
    throw new UserInputError(
      "Impossible de créer une révision sans modifications."
    );
  }

  await revisionRequestContentSchema.validate(flatContent);

  return flatContent;
}

const revisionRequestContentSchema = yup.object({
  wasteCode: yup
    .string()
    .oneOf([...BSDA_WASTE_CODES, "", null], INVALID_WASTE_CODE)
    .nullable(),
  wastePop: yup.boolean().nullable(),
  packagings: yup.array().nullable(),
  wasteSealNumbers: yup.array().of(yup.string()).nullable(),
  wasteMaterialName: yup.string().nullable(),
  destinationCap: yup.string().nullable(),
  destinationReceptionWeight: yup.number().nullable(),
  destinationOperationCode: yup
    .string()
    .oneOf(
      [null, "", ...OPERATIONS],
      "Le code de l'opération de traitement prévu ne fait pas partie de la liste reconnue : ${values}"
    )
    .nullable(),
  destinationOperationDescription: yup.string().nullable(),
  brokerCompanyName: yup.string().nullable(),
  brokerCompanySiret: yup.string().nullable(),
  brokerCompanyAddress: yup.string().nullable(),
  brokerCompanyContact: yup.string().nullable(),
  brokerCompanyPhone: yup.string().nullable(),
  brokerCompanyMail: yup.string().nullable(),
  brokerRecepisseNumber: yup.string().nullable(),
  brokerRecepisseDepartment: yup.string().nullable(),
  brokerRecepisseValidityLimit: yup.date().nullable(),
  emitterPickupSiteName: yup.string().nullable(),
  emitterPickupSiteAddress: yup.string().nullable(),
  emitterPickupSiteCity: yup.string().nullable(),
  emitterPickupSitePostalCode: yup.string().nullable(),
  emitterPickupSiteInfos: yup.string().nullable()
});
