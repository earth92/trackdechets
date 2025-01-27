import { checkIsAuthenticated } from "../../../common/permissions";
import { MutationResolvers } from "../../../generated/graphql/types";
import prisma from "../../../prisma";
import {
  flattenFicheInterventionBsffInput,
  expandFicheInterventionBsffFromDB
} from "../../converter";
import { checkCanWriteFicheIntervention } from "../../permissions";
import { validateFicheIntervention } from "../../validation";

const createFicheInterventionBsff: MutationResolvers["createFicheInterventionBsff"] =
  async (_, { input }, context) => {
    const user = checkIsAuthenticated(context);

    const flatInput = flattenFicheInterventionBsffInput(input);
    await checkCanWriteFicheIntervention(user, flatInput);

    await validateFicheIntervention(flatInput);

    const ficheIntervention = await prisma.bsffFicheIntervention.create({
      data: flatInput
    });

    return expandFicheInterventionBsffFromDB(ficheIntervention);
  };

export default createFicheInterventionBsff;
