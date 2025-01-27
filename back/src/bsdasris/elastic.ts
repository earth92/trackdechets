import { BsdasriStatus, Bsdasri, BsdasriType } from "@prisma/client";
import { BsdElastic, indexBsd } from "../common/elastic";

import { DASRI_WASTE_CODES_MAPPING } from "../common/constants/DASRI_CONSTANTS";
import { GraphQLContext } from "../types";
import { getRegistryFields } from "./registry";

// | state              | emitter | transporter | recipient |
// |--------------------|---------|-------------|-----------|
// | initial (draft)    | draft   | draft       | draft     |
// | initial            | action  | to collect  | follow    |
// | initial(synthesis) | follow  | to collect  | follow    |
// | signed_by_producer | follow  | to collect  | follow    |
// | sent               | follow  | collected   | action    |
// | received           | follow  | follow      | action    |
// | processed          | archive | archive     | archive   |
// | refused            | archive | archive     | archive   |
// | awaiting_group     | follow  | follow      | follow    |

function getWhere(
  bsdasri: Bsdasri
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

  const formSirets: Record<string, string | null | undefined> = {
    emitterCompanySiret: bsdasri.emitterCompanySiret,
    destinationCompanySiret: bsdasri.destinationCompanySiret,
    transporterCompanySiret: bsdasri.transporterCompanySiret,
    ecoOrganismeSiret: bsdasri.ecoOrganismeSiret
  };

  const siretsFilters = new Map<string, keyof typeof where>(
    Object.entries(formSirets)
      .filter(([_, siret]) => !!siret)
      .map(([actor, _]) => [actor, "isFollowFor"])
  );

  type Mapping = Map<string, keyof typeof where>;
  const setTab = (map: Mapping, key: string, newValue: keyof typeof where) => {
    if (!map.has(key)) {
      return;
    }

    map.set(key, newValue);
  };
  switch (bsdasri.status) {
    case BsdasriStatus.INITIAL: {
      if (bsdasri.isDraft) {
        for (const fieldName of siretsFilters.keys()) {
          setTab(siretsFilters, fieldName, "isDraftFor");
        }
      } else {
        if (bsdasri.type !== BsdasriType.SYNTHESIS) {
          // for Synthesis dasri emitter & transporter are the same company, INITIAL bsd should appear in `isToCollectFor` tab
          setTab(siretsFilters, "emitterCompanySiret", "isForActionFor");
          setTab(siretsFilters, "ecoOrganismeSiret", "isForActionFor");
        }

        setTab(siretsFilters, "transporterCompanySiret", "isToCollectFor");
      }
      break;
    }

    case BsdasriStatus.SIGNED_BY_PRODUCER: {
      setTab(siretsFilters, "transporterCompanySiret", "isToCollectFor");
      break;
    }

    case BsdasriStatus.SENT: {
      setTab(siretsFilters, "destinationCompanySiret", "isForActionFor");
      setTab(siretsFilters, "transporterCompanySiret", "isCollectedFor");
      break;
    }

    case BsdasriStatus.RECEIVED: {
      setTab(siretsFilters, "destinationCompanySiret", "isForActionFor");
      break;
    }

    case BsdasriStatus.REFUSED:
    case BsdasriStatus.PROCESSED: {
      for (const fieldName of siretsFilters.keys()) {
        setTab(siretsFilters, fieldName, "isArchivedFor");
      }
      break;
    }
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

/**
 * Convert a dasri from the bsdasri table to Elastic Search's BSD model.
 */
export function toBsdElastic(bsdasri: Bsdasri): BsdElastic {
  const where = getWhere(bsdasri);

  return {
    id: bsdasri.id,
    readableId: bsdasri.id,
    customId: "",
    type: "BSDASRI",
    emitterCompanyName: bsdasri.emitterCompanyName ?? "",
    emitterCompanySiret: bsdasri.emitterCompanySiret ?? "",
    transporterCompanyName: bsdasri.transporterCompanyName ?? "",
    transporterCompanySiret: bsdasri.transporterCompanySiret ?? "",
    transporterTakenOverAt: bsdasri.transporterTakenOverAt?.getTime(),
    transporterCustomInfo: bsdasri.transporterCustomInfo ?? "",
    destinationCompanyName: bsdasri.destinationCompanyName ?? "",
    destinationCompanySiret: bsdasri.destinationCompanySiret ?? "",
    destinationReceptionDate: bsdasri.destinationReceptionDate?.getTime(),
    destinationReceptionWeight: bsdasri.destinationReceptionWasteWeightValue,
    destinationOperationCode: bsdasri.destinationOperationCode ?? "",
    destinationOperationDate: bsdasri.destinationOperationDate?.getTime(),
    wasteCode: bsdasri.wasteCode ?? "",
    wasteDescription: DASRI_WASTE_CODES_MAPPING[bsdasri.wasteCode],
    transporterNumberPlate: bsdasri.transporterTransportPlates,
    createdAt: bsdasri.createdAt.getTime(),
    updatedAt: bsdasri.updatedAt.getTime(),
    ...where,
    sirets: Object.values(where).flat(),
    ...getRegistryFields(bsdasri),
    rawBsd: bsdasri
  };
}

export function indexBsdasri(bsdasri: Bsdasri, ctx?: GraphQLContext) {
  return indexBsd(toBsdElastic(bsdasri), ctx);
}
