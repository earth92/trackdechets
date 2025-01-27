import { Form, Status } from "@prisma/client";
import { BsdElastic, indexBsd } from "../common/elastic";
import { FullForm } from "./types";
import { GraphQLContext } from "../types";
import { getRegistryFields } from "./registry";

/**
 * Computes which SIRET should appear on which tab in the frontend
 * (Brouillon, Pour Action, Suivi, Archives, À collecter, Collecté)
 */
export function getSiretsByTab(
  form: FullForm
): Pick<
  BsdElastic,
  | "isDraftFor"
  | "isForActionFor"
  | "isFollowFor"
  | "isArchivedFor"
  | "isToCollectFor"
  | "isCollectedFor"
> {
  // we build a mapping where each key has to be unique.
  // Same siret can be used by different actors on the same form, so we can't use them as keys.
  // Instead we rely on field names and segments ids
  const multimodalTransportersBySegmentId = form.transportSegments.reduce(
    (acc, segment) => {
      if (!!segment.transporterCompanySiret) {
        return { ...acc, [`${segment.id}`]: segment.transporterCompanySiret };
      }
      return acc;
    },
    {}
  );

  const intermediarySiretsReducer = form.intermediaries.reduce(
    (acc, intermediary) => {
      if (!!intermediary.siret) {
        return {
          ...acc,
          [`intermediarySiret${intermediary.siret}`]: intermediary.siret
        };
      }
      return acc;
    },
    {}
  );

  const formSirets = {
    emitterCompanySiret: form.emitterCompanySiret,
    recipientCompanySiret: form.recipientCompanySiret,
    forwardedInDestinationCompanySiret: form.forwardedIn?.recipientCompanySiret,
    forwardedInTransporterCompanySiret:
      form.forwardedIn?.transporterCompanySiret,
    traderCompanySiret: form.traderCompanySiret,
    brokerCompanySiret: form.brokerCompanySiret,
    ecoOrganismeSiret: form.ecoOrganismeSiret,
    transporterCompanySiret: form.transporterCompanySiret,
    transporterCompanyVatNumber: form.transporterCompanyVatNumber,
    ...multimodalTransportersBySegmentId,
    ...intermediarySiretsReducer
  };

  const siretsByTab = {
    isDraftFor: [],
    isForActionFor: [],
    isFollowFor: [],
    isArchivedFor: [],
    isToCollectFor: [],
    isCollectedFor: []
  };

  // build a mapping to store which actor will see this form appear on a given UI tab
  // eg: 'transporterCompanySiret' : 'isCollectedFor'
  const fieldTabs = new Map<string, keyof typeof siretsByTab>(
    Object.entries(formSirets)
      .filter(item => !!item[1])
      // initialize all SIRET into "isFollowFor"
      .map(item => [item[0], "isFollowFor"])
  );

  function setFieldTab(field: string, tab: keyof typeof siretsByTab) {
    if (!fieldTabs.has(field)) {
      return;
    }
    fieldTabs.set(field, tab);
  }

  // initialize intermediaries into isFollowFor
  form.intermediaries.forEach(({ siret }) =>
    setFieldTab(`intermediarySiret${siret}`, "isFollowFor")
  );

  switch (form.status) {
    case Status.DRAFT: {
      for (const fieldName of fieldTabs.keys()) {
        setFieldTab(fieldName, "isDraftFor");
      }
      break;
    }
    case Status.SEALED: {
      setFieldTab("emitterCompanySiret", "isForActionFor");
      setFieldTab("ecoOrganismeSiret", "isForActionFor");
      setFieldTab("transporterCompanySiret", "isToCollectFor");
      setFieldTab("transporterCompanyVatNumber", "isToCollectFor");

      break;
    }
    case Status.SIGNED_BY_PRODUCER: {
      setFieldTab("transporterCompanySiret", "isToCollectFor");
      setFieldTab("transporterCompanyVatNumber", "isToCollectFor");

      break;
    }
    case Status.SENT: {
      setFieldTab("recipientCompanySiret", "isForActionFor");

      // whether or not this BSD has been handed over by transporter n°1
      let hasBeenHandedOver = false;

      form.transportSegments.forEach(segment => {
        if (segment.readyToTakeOver) {
          hasBeenHandedOver = hasBeenHandedOver || !!segment.takenOverAt;
          setFieldTab(
            segment.id,
            segment.takenOverAt ? "isCollectedFor" : "isToCollectFor"
          );
        }
      });

      if (!hasBeenHandedOver) {
        setFieldTab("transporterCompanySiret", "isCollectedFor");
        setFieldTab("transporterCompanyVatNumber", "isCollectedFor");
      }

      break;
    }
    case Status.TEMP_STORED:
    case Status.TEMP_STORER_ACCEPTED: {
      setFieldTab("recipientCompanySiret", "isForActionFor");
      break;
    }
    case Status.RESEALED: {
      setFieldTab("recipientCompanySiret", "isForActionFor");
      setFieldTab("forwardedInTransporterCompanySiret", "isToCollectFor");

      break;
    }
    case Status.SIGNED_BY_TEMP_STORER: {
      setFieldTab("forwardedInTransporterCompanySiret", "isToCollectFor");

      break;
    }
    case Status.RESENT:
      setFieldTab("forwardedInTransporterCompanySiret", "isCollectedFor");
    case Status.RECEIVED:
    case Status.ACCEPTED: {
      setFieldTab(
        form.recipientIsTempStorage
          ? "forwardedInDestinationCompanySiret"
          : "recipientCompanySiret",
        "isForActionFor"
      );

      break;
    }
    case Status.AWAITING_GROUP:
    case Status.GROUPED:
    case Status.REFUSED:
    case Status.PROCESSED:
    case Status.FOLLOWED_WITH_PNTTD:
    case Status.NO_TRACEABILITY: {
      for (const siret of fieldTabs.keys()) {
        setFieldTab(siret, "isArchivedFor");
      }
      break;
    }
    default:
      break;
  }

  for (const [field, tab] of fieldTabs.entries()) {
    if (field) {
      siretsByTab[tab].push(formSirets[field]);
    }
  }

  return siretsByTab;
}

function getRecipient(form: FullForm) {
  return form.forwardedIn?.emittedAt
    ? {
        name: form.forwardedIn.recipientCompanyName,
        siret: form.forwardedIn.recipientCompanySiret
      }
    : { name: form.recipientCompanyName, siret: form.recipientCompanySiret };
}

/**
 * Convert a BSD from the forms table to Elastic Search's BSD model.
 */
export function toBsdElastic(
  form: FullForm & { forwarding?: Form }
): BsdElastic {
  const siretsByTab = getSiretsByTab(form);
  const recipient = getRecipient(form);

  // const forwardedIn: Form = form.forwardedIn
  // ? await prisma.form.findUnique({ where: { id: form.id } }).forwardedIn()
  // : null;
  return {
    type: "BSDD",
    id: form.id,
    readableId: form.readableId,
    customId: form.customId,
    createdAt: form.createdAt.getTime(),
    updatedAt: form.updatedAt.getTime(),
    emitterCompanyName: form.emitterCompanyName ?? "",
    emitterCompanySiret: form.emitterCompanySiret ?? "",
    transporterCompanyName: form.transporterCompanyName ?? "",
    transporterCompanySiret: form.transporterCompanySiret ?? "",
    transporterCompanyVatNumber: form.transporterCompanyVatNumber ?? "",
    transporterTakenOverAt: form.sentAt?.getTime(),
    destinationCompanyName: recipient.name ?? "",
    destinationCompanySiret: recipient.siret ?? "",
    destinationReceptionDate: form.receivedAt?.getTime(),
    destinationReceptionWeight: form.quantityReceived,
    destinationOperationCode: form.processingOperationDone ?? "",
    destinationOperationDate: form.processedAt?.getTime(),
    wasteCode: form.wasteDetailsCode ?? "",
    wasteDescription: form.wasteDetailsName,
    transporterNumberPlate: [form.transporterNumberPlate],
    transporterCustomInfo: form.transporterCustomInfo,
    ...(form.forwarding
      ? {
          // do not display BSD suite in dashboard
          isDraftFor: [],
          isForActionFor: [],
          isFollowFor: [],
          isArchivedFor: [],
          isToCollectFor: [],
          isCollectedFor: []
        }
      : siretsByTab),
    sirets: Object.values(siretsByTab).flat(),
    ...getRegistryFields(form),
    intermediaries: form.intermediaries,
    rawBsd: form
  };
}

export async function indexForm(
  form: FullForm,
  ctx?: GraphQLContext
): Promise<BsdElastic> {
  // prevent unwanted cascaded reindexation
  if (form.isDeleted) {
    return null;
  }
  if (form.forwardedIn) {
    // index next BSD asynchronously
    indexBsd(
      toBsdElastic({
        ...form.forwardedIn,
        transportSegments: [],
        intermediaries: [],
        forwardedIn: null,
        forwarding: form
      })
    );
  }
  const bsdElastic = toBsdElastic(form);
  await indexBsd(bsdElastic, ctx);
  return bsdElastic;
}
