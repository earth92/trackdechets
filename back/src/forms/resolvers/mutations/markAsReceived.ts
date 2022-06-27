import { MutationResolvers } from "../../../generated/graphql/types";
import { checkIsAuthenticated } from "../../../common/permissions";
import { getFormOrFormNotFound } from "../../database";
import transitionForm from "../../workflow/transitionForm";
import { checkCanMarkAsReceived } from "../../permissions";
import { receivedInfoSchema } from "../../validation";
import { EventType } from "../../workflow/types";
import { expandFormFromDb } from "../../form-converter";
import { TemporaryStorageCannotReceive } from "../../errors";
import prisma from "../../../prisma";
import { getFormRepository } from "../../repository";
import {
  Prisma,
  QuantityType,
  Status,
  WasteAcceptationStatus
} from "@prisma/client";

const markAsReceivedResolver: MutationResolvers["markAsReceived"] = async (
  parent,
  args,
  context
) => {
  const user = checkIsAuthenticated(context);
  const { id, receivedInfo } = args;
  const form = await getFormOrFormNotFound({ id });
  await checkCanMarkAsReceived(user, form);
  const formRepository = getFormRepository(user);

  if (form.recipientIsTempStorage === true) {
    // this form can be mark as received only if it has been
    // taken over by the transporter after temp storage
    const { forwardedIn } = await formRepository.findFullFormById(form.id);

    if (!forwardedIn?.emittedAt) {
      throw new TemporaryStorageCannotReceive();
    }
  }

  await receivedInfoSchema.validate(receivedInfo);
  const formUpdateInput: Prisma.FormUpdateInput = form.forwardedInId
    ? {
        forwardedIn: {
          update: {
            status: [
              WasteAcceptationStatus.ACCEPTED,
              WasteAcceptationStatus.PARTIALLY_REFUSED
            ].includes(receivedInfo.wasteAcceptationStatus as any)
              ? Status.ACCEPTED
              : receivedInfo.wasteAcceptationStatus ==
                WasteAcceptationStatus.REFUSED
              ? Status.REFUSED
              : Status.RECEIVED,
            ...receivedInfo
          }
        },
        currentTransporterSiret: ""
      }
    : {
        ...receivedInfo,
        quantityReceivedType: QuantityType.REAL,
        currentTransporterSiret: ""
      };

  const receivedForm = await transitionForm(user, form, {
    type: EventType.MarkAsReceived,
    formUpdateInput
  });

  // check for stale transport segments and delete them
  // quick fix https://trackdechets.zammad.com/#ticket/zoom/1696
  const staleSegments = await prisma.form
    .findUnique({ where: { id: form.id } })
    .transportSegments({ where: { takenOverAt: null } });
  if (staleSegments.length > 0) {
    await prisma.transportSegment.deleteMany({
      where: { id: { in: staleSegments.map(s => s.id) } }
    });
  }

  if (receivedInfo.wasteAcceptationStatus === WasteAcceptationStatus.REFUSED) {
    await formRepository.removeAppendix2(id);
  }

  return expandFormFromDb(receivedForm);
};

export default markAsReceivedResolver;
