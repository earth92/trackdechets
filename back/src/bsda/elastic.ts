import { Bsda, BsdaStatus, IntermediaryBsdaAssociation } from "@prisma/client";
import { BsdElastic, indexBsd } from "../common/elastic";
import { GraphQLContext } from "../types";
import { getRegistryFields } from "./registry";

export type BsdaToElastic = Bsda & {
  intermediaries: IntermediaryBsdaAssociation[];
};

// | state              | emitter         | worker          | transporter | destination     | nextDestination | intermediary |
// | ------------------ | --------------- | --------------- | ----------- | --------------- | --------------- | ------------ |
// | INITIAL (draft)    | draft           | draft           | draft       | draft           | follow          | follow       |
// | INITIAL            | action / follow | follow / action | follow      | follow / action | follow          | follow       |
// | SIGNED_BY_PRODUCER | follow          | action          | follow      | follow          | follow          | follow       |
// | SIGNED_BY_WORKER   | follow          | follow          | to collect  | follow          | follow          | follow       |
// | SENT               | follow          | follow          | collected   | action          | follow          | follow       |
// | PROCESSED          | archive         | archive         | archive     | archive         | follow          | archive      |
// | REFUSED            | archive         | archive         | archive     | archive         | follow          | archive      |
// | AWAITING_CHILD     | follow          | follow          | follow      | follow          | follow          | follow       |
function getWhere(
  bsda: BsdaToElastic
): Pick<
  BsdElastic,
  | "isDraftFor"
  | "isForActionFor"
  | "isFollowFor"
  | "isArchivedFor"
  | "isToCollectFor"
  | "isCollectedFor"
> {
  const where = {
    isDraftFor: [],
    isForActionFor: [],
    isFollowFor: [],
    isArchivedFor: [],
    isToCollectFor: [],
    isCollectedFor: []
  };

  const intermediarySirets = bsda.intermediaries.reduce(
    (sirets, intermediary) => {
      if (intermediary.siret) {
        const nbOfKeys = Object.keys(sirets).length;
        return {
          ...sirets,
          [`intermediarySiret${nbOfKeys + 1}`]: intermediary.siret
        };
      }
      return sirets;
    },
    {}
  );

  const formSirets: Partial<Record<keyof Bsda, string | null | undefined>> = {
    emitterCompanySiret: bsda.emitterCompanySiret,
    workerCompanySiret: bsda.workerCompanySiret,
    destinationCompanySiret: bsda.destinationCompanySiret,
    transporterCompanySiret: bsda.transporterCompanySiret,
    brokerCompanySiret: bsda.brokerCompanySiret,
    destinationOperationNextDestinationCompanySiret:
      bsda.destinationOperationNextDestinationCompanySiret,
    ...intermediarySirets
  };

  const siretsFilters = new Map<string, keyof typeof where>(
    Object.entries(formSirets)
      .filter(([_, siret]) => Boolean(siret))
      .map(([actor, _]) => [actor, "isFollowFor"])
  );
  type Mapping = Map<string, keyof typeof where>;
  const setTab = (map: Mapping, key: string, newValue: keyof typeof where) => {
    if (!map.has(key)) {
      return;
    }

    map.set(key, newValue);
  };

  switch (bsda.status) {
    case BsdaStatus.INITIAL:
      if (bsda.isDraft) {
        for (const fieldName of siretsFilters.keys()) {
          setTab(siretsFilters, fieldName, "isDraftFor");
        }
        break;
      }
      if (bsda.type === "COLLECTION_2710") {
        setTab(siretsFilters, "destinationCompanySiret", "isForActionFor");
        break;
      }
      if (bsda.emitterIsPrivateIndividual && bsda.workerIsDisabled) {
        setTab(siretsFilters, "transporterCompanySiret", "isToCollectFor");
        break;
      }
      if (
        bsda.workerWorkHasEmitterPaperSignature ||
        bsda.emitterIsPrivateIndividual
      ) {
        setTab(siretsFilters, "workerCompanySiret", "isForActionFor");
        break;
      }
      setTab(siretsFilters, "emitterCompanySiret", "isForActionFor");
      break;

    case BsdaStatus.SIGNED_BY_PRODUCER:
      if (bsda.type === "OTHER_COLLECTIONS" && !bsda.workerIsDisabled) {
        setTab(siretsFilters, "workerCompanySiret", "isForActionFor");
      } else {
        // Bsda types GATHERING and RESHIPMENT do not expect worker signature,
        // so they're ready to take over an must appear on transporter dashboard
        // (COLLECTION_2710 is directly PROCESSED and never SIGNED_BY_PRODUCER)
        setTab(siretsFilters, "transporterCompanySiret", "isToCollectFor");
      }

      break;

    case BsdaStatus.SIGNED_BY_WORKER:
      setTab(siretsFilters, "transporterCompanySiret", "isToCollectFor");
      break;

    case BsdaStatus.SENT:
      setTab(siretsFilters, "destinationCompanySiret", "isForActionFor");
      setTab(siretsFilters, "transporterCompanySiret", "isCollectedFor");
      break;

    case BsdaStatus.REFUSED:
    case BsdaStatus.PROCESSED:
      for (const fieldName of siretsFilters.keys()) {
        setTab(siretsFilters, fieldName, "isArchivedFor");
      }
      break;

    case BsdaStatus.AWAITING_CHILD:
    default:
      break;
  }

  for (const [fieldName, filter] of siretsFilters.entries()) {
    if (fieldName) {
      where[filter].push(formSirets[fieldName]);
    }
  }

  return where;
}

export function toBsdElastic(bsda: BsdaToElastic): BsdElastic {
  const where = getWhere(bsda);

  return {
    type: "BSDA",
    id: bsda.id,
    customId: "",
    readableId: bsda.id,
    createdAt: bsda.createdAt.getTime(),
    updatedAt: bsda.updatedAt.getTime(),
    emitterCompanyName: bsda.emitterCompanyName ?? "",
    emitterCompanySiret: bsda.emitterCompanySiret ?? "",
    transporterCompanyName: bsda.transporterCompanyName ?? "",
    transporterCompanySiret: bsda.transporterCompanySiret ?? "",
    transporterTakenOverAt: bsda.transporterTransportTakenOverAt?.getTime(),
    transporterCustomInfo: bsda.transporterCustomInfo ?? "",
    transporterNumberPlate: bsda.transporterTransportPlates,
    destinationCompanyName: bsda.destinationCompanyName ?? "",
    destinationCompanySiret: bsda.destinationCompanySiret ?? "",
    destinationReceptionDate: bsda.destinationReceptionDate?.getTime(),
    destinationReceptionWeight: bsda.destinationReceptionWeight,
    destinationOperationCode: bsda.destinationOperationCode ?? "",
    destinationOperationDate: bsda.destinationOperationDate?.getTime(),
    wasteCode: bsda.wasteCode ?? "",
    wasteDescription: bsda.wasteMaterialName,
    ...where,
    sirets: Object.values(where).flat(),
    ...getRegistryFields(bsda),
    intermediaries: bsda.intermediaries,
    rawBsd: bsda
  };
}

export function indexBsda(bsda: BsdaToElastic, ctx?: GraphQLContext) {
  return indexBsd(toBsdElastic(bsda), ctx);
}
