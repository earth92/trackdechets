import { ForbiddenError } from "apollo-server-express";
import { checkIsAuthenticated } from "../../../common/permissions";
import { MutationPublishBsdaArgs } from "../../../generated/graphql/types";
import { GraphQLContext } from "../../../types";
import { expandBsdaFromDb } from "../../converter";
import { getBsdaOrNotFound, getPreviousBsdas } from "../../database";
import { checkIsBsdaContributor } from "../../permissions";
import { getBsdaRepository } from "../../repository";
import { validateBsda } from "../../validation";

export default async function create(
  _,
  { id }: MutationPublishBsdaArgs,
  context: GraphQLContext
) {
  const user = checkIsAuthenticated(context);

  const existingBsda = await getBsdaOrNotFound(id, {
    include: { intermediaries: true }
  });
  await checkIsBsdaContributor(
    user,
    existingBsda,
    "Vous ne pouvez pas modifier un bordereau sur lequel votre entreprise n'apparait pas"
  );

  if (!existingBsda.isDraft) {
    throw new ForbiddenError(
      "Impossible de publier un bordereau qui n'est pas un brouillon"
    );
  }

  const previousBsdas = await getPreviousBsdas(existingBsda);
  const { intermediaries, ...bsda } = existingBsda;
  await validateBsda(
    bsda,
    { previousBsdas, intermediaries },
    { emissionSignature: true }
  );

  const updatedBsda = await getBsdaRepository(user).update(
    { id },
    { isDraft: false }
  );

  return expandBsdaFromDb(updatedBsda);
}
