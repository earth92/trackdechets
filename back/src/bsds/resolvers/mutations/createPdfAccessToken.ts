import prisma from "../../../prisma";
import { addMinutes } from "date-fns";
import { MutationResolvers } from "../../../generated/graphql/types";
import { ForbiddenError } from "apollo-server-core";
import { ReadableIdPrefix } from "../../../forms/readableId";

import { getUid, getAPIBaseURL } from "../../../utils";

import { checkIsAuthenticated } from "../../../common/permissions";
import { checkCanReadBsdasri } from "../../../bsdasris/permissions";
import { checkIsBsdaContributor } from "../../../bsda/permissions";
import { checkCanReadBsff } from "../../../bsffs/permissions";
import { checkIsBsvhuContributor } from "../../../bsvhu/permissions";
import { checkIsFormContributor } from "../../../forms/permissions";
import { getFormOrFormNotFound } from "../../../forms/database";
import { getBsdasriOrNotFound } from "../../../bsdasris/database";
import { getBsdaOrNotFound } from "../../../bsda/database";
import { getBsffOrNotFound } from "../../../bsffs/database";
import { getBsvhuOrNotFound } from "../../../bsvhu/database";
import {
  BsdType,
  BsdasriStatus,
  BsffStatus,
  BsvhuStatus,
  BsdaStatus,
  Status
} from "@prisma/client";
import { ROAD_CONTROL_SLUG } from "../../../common/constants";

const accessors = {
  [BsdType.BSDD]: id => getFormOrFormNotFound({ id }),
  [BsdType.BSDA]: id => getBsdaOrNotFound(id),
  [BsdType.BSDASRI]: id => getBsdasriOrNotFound({ id }),
  [BsdType.BSFF]: id => getBsffOrNotFound({ id }),
  [BsdType.BSVHU]: id => getBsvhuOrNotFound(id)
};

const checkStatus = {
  [BsdType.BSDD]: bsd => [Status.SENT, Status.RESENT].includes(bsd.status),
  [BsdType.BSDA]: bsd => bsd.status === BsdaStatus.SENT,
  [BsdType.BSDASRI]: bsd => bsd.status === BsdasriStatus.SENT,
  [BsdType.BSFF]: bsd => bsd.status === BsffStatus.SENT,
  [BsdType.BSVHU]: bsd => bsd.status === BsvhuStatus.SENT
};

const deniedAccessMessage = "Vous n'êtes pas autorisé à accéder à ce bordereau";
const permissions = {
  [BsdType.BSDD]: (user, bsdd) =>
    checkIsFormContributor(user, bsdd, deniedAccessMessage),
  [BsdType.BSDA]: (user, bsda) =>
    checkIsBsdaContributor(user, bsda, deniedAccessMessage),
  [BsdType.BSDASRI]: (user, bsdasri) => checkCanReadBsdasri(user, bsdasri),
  [BsdType.BSFF]: (user, bsff) => checkCanReadBsff(user, bsff),
  [BsdType.BSVHU]: (user, bsvhu) =>
    checkIsBsvhuContributor(user, bsvhu, deniedAccessMessage)
};

const getBsdType = (id: string): BsdType => {
  if (id.startsWith(ReadableIdPrefix.DASRI)) {
    return BsdType.BSDASRI;
  }
  if (id.startsWith(ReadableIdPrefix.BSDA)) {
    return BsdType.BSDA;
  }
  if (id.startsWith(ReadableIdPrefix.FF)) {
    return BsdType.BSFF;
  }
  if (id.startsWith(ReadableIdPrefix.VHU)) {
    return BsdType.BSVHU;
  }

  return BsdType.BSDD;
};

const createPdfAccessToken: MutationResolvers["createPdfAccessToken"] = async (
  _,
  { input },
  context
) => {
  const user = checkIsAuthenticated(context);
  // find bsd

  const bsdType = getBsdType(input.bsdId);

  const bsd = await accessors[bsdType](input.bsdId);

  // check status
  if (!checkStatus[bsdType](bsd)) {
    throw new ForbiddenError(
      "Seuls les bordereaux pris en charge par un transporteur peuvent être consulté via un accès temporaire."
    );
  }
  // check perms
  await permissions[bsdType](user, bsd);

  const token = await prisma.pdfAccessToken.create({
    data: {
      token: getUid(50),
      bsdType: bsdType,
      bsdId: input.bsdId,
      userId: user.id,
      expiresAt: addMinutes(new Date(), 30)
    }
  });
  const API_BASE_URL = getAPIBaseURL();
  return `${API_BASE_URL}/${ROAD_CONTROL_SLUG}/${token.token}`;
};

export default createPdfAccessToken;
