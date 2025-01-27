import { UserInputError } from "apollo-server-express";
import { checkIsAuthenticated } from "../../../common/permissions";
import getReadableId, { ReadableIdPrefix } from "../../../forms/readableId";
import {
  BsdaInput,
  MutationCreateBsdaArgs
} from "../../../generated/graphql/types";
import { GraphQLContext } from "../../../types";
import { getUserCompanies } from "../../../users/database";
import {
  companyToIntermediaryInput,
  expandBsdaFromDb,
  flattenBsdaInput
} from "../../converter";
import { getBsdaOrNotFound } from "../../database";
import { checkIsBsdaContributor } from "../../permissions";
import { getBsdaRepository } from "../../repository";
import { validateBsda } from "../../validation";

type CreateBsda = {
  isDraft: boolean;
  input: BsdaInput;
  context: GraphQLContext;
};

export default async function create(
  _,
  { input }: MutationCreateBsdaArgs,
  context: GraphQLContext
) {
  return genericCreate({ isDraft: false, input, context });
}

export async function genericCreate({ isDraft, input, context }: CreateBsda) {
  const user = checkIsAuthenticated(context);

  const bsda = flattenBsdaInput(input);
  await checkIsBsdaContributor(
    user,
    { ...bsda, intermediaries: input.intermediaries },
    "Vous ne pouvez pas créer un bordereau sur lequel votre entreprise n'apparait pas"
  );

  const isForwarding = Boolean(input.forwarding);
  const isGrouping = input.grouping?.length > 0;

  if ([isForwarding, isGrouping].filter(b => b).length > 1) {
    throw new UserInputError(
      "Les opérations d'entreposage provisoire et groupement ne sont pas compatibles entre elles"
    );
  }

  const companies = await getUserCompanies(user.id);
  const destinationCompany = companies.find(
    company => company.siret === input.destination?.company?.siret
  );
  if (
    bsda.type === "COLLECTION_2710" &&
    !destinationCompany?.companyTypes.includes("WASTE_CENTER")
  ) {
    throw new UserInputError(
      "Seules les déchetteries peuvent créer un bordereau de ce type, et elles doivent impérativement être identifiées comme destinataire du déchet."
    );
  }

  const bsdaRepository = getBsdaRepository(user);
  const forwardedBsda = isForwarding
    ? await getBsdaOrNotFound(input.forwarding)
    : null;
  const groupedBsdas = isGrouping
    ? await bsdaRepository.findMany({ id: { in: input.grouping } })
    : [];

  const previousBsdas = [
    ...(isForwarding ? [forwardedBsda] : []),
    ...(isGrouping ? groupedBsdas : [])
  ];
  const hasIntermediaries = input.intermediaries?.length > 0;

  await validateBsda(
    bsda,
    { previousBsdas, intermediaries: input.intermediaries },
    {
      emissionSignature: !isDraft
    }
  );

  const newBsda = await bsdaRepository.create({
    ...bsda,
    id: getReadableId(ReadableIdPrefix.BSDA),
    isDraft,
    ...(isForwarding && {
      forwarding: { connect: { id: input.forwarding } }
    }),
    ...(isGrouping && {
      grouping: { connect: groupedBsdas.map(({ id }) => ({ id })) }
    }),
    ...(hasIntermediaries && {
      intermediaries: {
        createMany: {
          data: companyToIntermediaryInput(input.intermediaries)
        }
      }
    })
  });

  return expandBsdaFromDb(newBsda);
}
