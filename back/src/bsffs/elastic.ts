import { Bsff, BsffStatus, BsffPackaging } from "@prisma/client";
import prisma from "../prisma";
import { BsdElastic, indexBsd } from "../common/elastic";
import { GraphQLContext } from "../types";
import { getRegistryFields } from "./registry";
import { toBsffDestination } from "./compat";

export function toBsdElastic(
  bsff: Bsff & { packagings: BsffPackaging[] }
): BsdElastic {
  const bsffDestination = toBsffDestination(bsff.packagings);

  const bsd = {
    type: "BSFF" as const,
    id: bsff.id,
    readableId: bsff.id,
    customId: "",
    createdAt: bsff.createdAt.getTime(),
    updatedAt: bsff.updatedAt.getTime(),
    emitterCompanyName: bsff.emitterCompanyName ?? "",
    emitterCompanySiret: bsff.emitterCompanySiret ?? "",
    transporterCompanyName: bsff.transporterCompanyName ?? "",
    transporterCompanySiret: bsff.transporterCompanySiret ?? "",
    transporterTakenOverAt:
      bsff.transporterTransportTakenOverAt?.getTime() ??
      bsff.transporterTransportSignatureDate?.getTime(),
    transporterCustomInfo: bsff.transporterCustomInfo ?? "",
    transporterNumberPlate: bsff.transporterTransportPlates ?? [],
    destinationCompanyName: bsff.destinationCompanyName ?? "",
    destinationCompanySiret: bsff.destinationCompanySiret ?? "",
    destinationReceptionDate: bsff.destinationReceptionDate?.getTime(),
    destinationReceptionWeight: bsffDestination.receptionWeight,
    destinationOperationCode: bsffDestination.operationCode ?? "",
    destinationOperationDate: bsffDestination.operationDate?.getTime(),
    wasteCode: bsff.wasteCode ?? "",
    wasteDescription: bsff.wasteDescription ?? "",
    containers: bsff.packagings.map(packaging => packaging.numero),
    isDraftFor: [],
    isForActionFor: [],
    isFollowFor: [],
    isArchivedFor: [],
    isToCollectFor: [],
    isCollectedFor: [],
    sirets: [
      bsff.emitterCompanySiret,
      bsff.transporterCompanySiret,
      bsff.destinationCompanySiret,
      ...bsff.detenteurCompanySirets
    ],
    ...getRegistryFields(bsff),
    rawBsd: {
      ...bsff,
      packagings: bsff.packagings.map(packaging => ({
        numero: packaging.numero
      }))
    }
  };

  if (bsff.isDraft) {
    bsd.isDraftFor.push(
      bsff.emitterCompanySiret,
      bsff.transporterCompanySiret,
      bsff.destinationCompanySiret
    );
  } else {
    bsd.isFollowFor.push(...bsff.detenteurCompanySirets);
    switch (bsff.status) {
      case BsffStatus.INITIAL: {
        bsd.isForActionFor.push(bsff.emitterCompanySiret);
        bsd.isFollowFor.push(
          bsff.transporterCompanySiret,
          bsff.destinationCompanySiret
        );
        break;
      }
      case BsffStatus.SIGNED_BY_EMITTER: {
        bsd.isToCollectFor.push(bsff.transporterCompanySiret);
        bsd.isFollowFor.push(
          bsff.emitterCompanySiret,
          bsff.destinationCompanySiret
        );
        break;
      }
      case BsffStatus.SENT: {
        bsd.isCollectedFor.push(bsff.transporterCompanySiret);
        bsd.isFollowFor.push(bsff.emitterCompanySiret);
        bsd.isForActionFor.push(bsff.destinationCompanySiret);
        break;
      }
      case BsffStatus.RECEIVED:
      case BsffStatus.PARTIALLY_REFUSED:
      case BsffStatus.ACCEPTED: {
        bsd.isFollowFor.push(
          bsff.emitterCompanySiret,
          bsff.transporterCompanySiret
        );
        bsd.isForActionFor.push(bsff.destinationCompanySiret);
        break;
      }
      case BsffStatus.INTERMEDIATELY_PROCESSED: {
        bsd.isFollowFor.push(
          bsff.emitterCompanySiret,
          bsff.transporterCompanySiret,
          bsff.destinationCompanySiret
        );
        break;
      }
      case BsffStatus.REFUSED:
      case BsffStatus.PROCESSED: {
        bsd.isArchivedFor.push(
          bsff.emitterCompanySiret,
          bsff.transporterCompanySiret,
          bsff.destinationCompanySiret
        );
        break;
      }
      default:
        break;
    }
  }

  return bsd;
}

export async function indexBsff(bsff: Bsff, ctx?: GraphQLContext) {
  const fullBsff = await prisma.bsff.findUnique({
    where: { id: bsff.id },
    include: { packagings: true }
  });
  return indexBsd(toBsdElastic(fullBsff), ctx);
}
