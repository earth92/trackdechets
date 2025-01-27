import prisma from "../../../prisma";
import { MutationResolvers } from "../../../generated/graphql/types";
import { checkIsAuthenticated } from "../../../common/permissions";
import {
  flattenBsffPackagingInput,
  expandBsffPackagingFromDB
} from "../../converter";
import { getBsffPackagingOrNotFound } from "../../database";
import { getCachedUserSiretOrVat } from "../../../common/redis/users";
import { UserInputError } from "apollo-server-core";

const updateBsffPackaging: MutationResolvers["updateBsffPackaging"] = async (
  _,
  { id, input },
  context
) => {
  const user = checkIsAuthenticated(context);
  const existingBsffPackaging = await getBsffPackagingOrNotFound({ id });

  const userCompaniesSiretOrVat = await getCachedUserSiretOrVat(user.id);

  if (
    !userCompaniesSiretOrVat.includes(
      existingBsffPackaging.bsff.destinationCompanySiret
    )
  ) {
    throw new UserInputError(
      "Seul le destinataire du BSFF peut modifier les informations d'acceptation et d'opération sur un contenant"
    );
  }

  const updatedBsffPackaging = await prisma.bsffPackaging.update({
    where: { id },
    data: flattenBsffPackagingInput(input)
  });

  return expandBsffPackagingFromDB(updatedBsffPackaging);
};

export default updateBsffPackaging;
