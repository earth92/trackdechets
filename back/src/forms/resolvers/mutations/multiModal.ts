import { ForbiddenError, UserInputError } from "apollo-server-express";
import * as Yup from "yup";
import { checkIsAuthenticated } from "../../../common/permissions";
import {
  MutationEditSegmentArgs,
  MutationMarkSegmentAsReadyToTakeOverArgs,
  MutationPrepareSegmentArgs,
  MutationTakeOverSegmentArgs,
  TransportSegment
} from "../../../generated/graphql/types";
import { GraphQLContext } from "../../../types";
import { getUserCompanies } from "../../../users/database";
import { getCachedUserSiretOrVat } from "../../../common/redis/users";

import {
  expandTransportSegmentFromDb,
  flattenTransportSegmentInput
} from "../../converter";
import { Prisma } from "@prisma/client";
import { getFormRepository } from "../../repository";
import prisma from "../../../prisma";

const SEGMENT_NOT_FOUND = "Le segment de transport n'a pas été trouvé";
const FORM_NOT_FOUND_OR_NOT_ALLOWED =
  "Le bordereau n'a pas été trouvé ou vous ne disposez pas des permissions nécessaires";
const FORM_MUST_BE_SENT = "Le bordereau doit être envoyé";
const FORM_MUST_BE_DRAFT = "Le bordereau doit être en brouillon";
const SEGMENT_ALREADY_SEALED = "Ce segment de transport est déjà scellé";
const SEGMENTS_ALREADY_PREPARED =
  "Il y a d'autres segments après le vôtre, vous ne pouvez pas ajouter de segment";

const segmentSchema = Yup.object<any>().shape({
  // id: Yup.string().label("Identifiant (id)").required(),
  mode: Yup.string().label("Mode de transport").required(),
  transporterCompanySiret: Yup.string()
    .label("Siret du transporteur")
    .required("La sélection d'une entreprise est obligatoire"),
  transporterCompanyAddress: Yup.string().required(),
  transporterCompanyContact: Yup.string().required(
    "Le contact dans l'entreprise est obligatoire"
  ),
  transporterCompanyPhone: Yup.string().required(
    "Le téléphone de l'entreprise est obligatoire"
  ),
  transporterCompanyMail: Yup.string()
    .email("Le format d'adresse email est incorrect")
    .required("L'email est obligatoire"),
  transporterIsExemptedOfReceipt: Yup.boolean().nullable(true),
  transporterReceipt: Yup.string().when(
    "transporterIsExemptedOfReceipt",
    (isExemptedOfReceipt, schema) =>
      isExemptedOfReceipt
        ? schema.nullable(true)
        : schema.required(
            "Vous n'avez pas précisé bénéficier de l'exemption de récépissé, il est donc est obligatoire"
          )
  ),
  transporterDepartment: Yup.string().when(
    "transporterIsExemptedOfReceipt",
    (isExemptedOfReceipt, schema) =>
      isExemptedOfReceipt
        ? schema.nullable(true)
        : schema.required("Le département du transporteur est obligatoire")
  ),

  transporterValidityLimit: Yup.date().nullable(),
  transporterNumberPlate: Yup.string().nullable(true)
});

const takeOverInfoSchema = Yup.object<any>().shape({
  takenOverAt: Yup.date().required(),
  takenOverBy: Yup.string().required("Le nom du responsable est obligatoire")
});

const formWithOwnerIdAndTransportSegments = Prisma.validator<Prisma.FormArgs>()(
  {
    include: {
      owner: { select: { id: true } },
      transportSegments: { select: { mode: true } }
    }
  }
);
type MultiModalForm = Prisma.FormGetPayload<
  typeof formWithOwnerIdAndTransportSegments
>;

/**
 *
 * Prepare a new transport segment
 */
export async function prepareSegment(
  { id, siret, nextSegmentInfo }: MutationPrepareSegmentArgs,
  context: GraphQLContext
): Promise<TransportSegment> {
  const user = checkIsAuthenticated(context);

  const userCompaniesSiretOrVat = await getCachedUserSiretOrVat(user.id);
  if (!userCompaniesSiretOrVat.includes(siret)) {
    throw new ForbiddenError(FORM_NOT_FOUND_OR_NOT_ALLOWED);
  }
  const nextSegmentPayload = flattenTransportSegmentInput(nextSegmentInfo);

  if (!nextSegmentPayload.transporterCompanySiret) {
    throw new ForbiddenError("Le siret est obligatoire");
  }
  const formRepository = getFormRepository(user);
  // get form and segments
  const form = (await formRepository.findUnique(
    { id },
    formWithOwnerIdAndTransportSegments
  )) as MultiModalForm;
  if (!form) {
    throw new ForbiddenError(FORM_NOT_FOUND_OR_NOT_ALLOWED);
  }
  const transportSegments = await prisma.transportSegment.findMany({
    where: {
      form: { id: id }
    }
  });

  // user must be the currentTransporter or form owner
  const userIsOwner = user.id === form.owner.id;
  const userIsCurrentTransporter =
    !!form.currentTransporterSiret && siret === form.currentTransporterSiret;

  if (!userIsOwner && !userIsCurrentTransporter) {
    throw new ForbiddenError(
      "Vous ne disposez pas des permissions nécessaires"
    );
  }

  // segments can be created by transporters if form is SENT and they're currently in charge of the form
  const userIsForbiddenToPrepareSentForm =
    userIsCurrentTransporter && form.status !== "SENT";

  // segments can be created by form owners when form is draft
  const userIsForbiddenToPrepareDraftForm =
    userIsOwner && form.status !== "DRAFT";

  // as user can be transporter and form owner, we dont want to forbid at first failing condition
  if (userIsForbiddenToPrepareSentForm && userIsForbiddenToPrepareDraftForm) {
    if (userIsForbiddenToPrepareDraftForm) {
      throw new ForbiddenError(FORM_MUST_BE_DRAFT);
    }
    if (userIsForbiddenToPrepareDraftForm) {
      throw new ForbiddenError(FORM_MUST_BE_DRAFT);
    }
  }

  const lastSegment = !!transportSegments.length
    ? transportSegments.slice(-1)[0]
    : null;
  if (
    !!lastSegment &&
    (!lastSegment.takenOverAt || lastSegment.transporterCompanySiret !== siret)
  ) {
    throw new ForbiddenError(SEGMENTS_ALREADY_PREPARED);
  }

  if (!nextSegmentPayload.transporterCompanySiret) {
    throw new UserInputError("Le siret est obligatoire");
  }

  const segmentInput = {
    ...nextSegmentPayload,
    previousTransporterCompanySiret: siret,
    segmentNumber: transportSegments.length + 1 // additional segments begin at index 1
  };
  await formRepository.update(
    { id },
    {
      nextTransporterSiret: nextSegmentPayload.transporterCompanySiret,
      transportSegments: {
        create: {
          ...segmentInput
        }
      }
    },
    { prepareSegment: true }
  );

  const segment = await prisma.transportSegment.findFirst({
    where: { segmentNumber: transportSegments.length + 1, form: { id: id } }
  });
  return expandTransportSegmentFromDb(segment);
}

export async function markSegmentAsReadyToTakeOver(
  { id }: MutationMarkSegmentAsReadyToTakeOverArgs,
  context: GraphQLContext
): Promise<TransportSegment> {
  const user = checkIsAuthenticated(context);

  const currentSegment = await prisma.transportSegment.findUnique({
    where: { id },
    include: {
      form: {
        select: {
          id: true
        }
      }
    }
  });

  if (!currentSegment) {
    throw new ForbiddenError(SEGMENT_NOT_FOUND);
  }
  const formRepository = getFormRepository(user);
  const form = await formRepository.findUnique(
    { id: currentSegment.form.id },
    formWithOwnerIdAndTransportSegments
  );

  if (form.status !== "SENT") {
    throw new ForbiddenError(FORM_MUST_BE_SENT);
  }

  const userCompanies = await getUserCompanies(user.id);
  const userCompaniesSiretOrVat = userCompanies.map(c => c.siret);
  if (!userCompaniesSiretOrVat.includes(form.currentTransporterSiret)) {
    throw new ForbiddenError(FORM_NOT_FOUND_OR_NOT_ALLOWED);
  }

  if (currentSegment.readyToTakeOver) {
    throw new ForbiddenError(SEGMENT_ALREADY_SEALED);
  }

  const segmentErrors: string[] = await segmentSchema
    .validate(currentSegment, { abortEarly: false })
    .catch(err => err.errors);

  if (!!segmentErrors.length) {
    throw new UserInputError(
      `Erreur, impossible de finaliser la préparation du transfert multi-modal car des champs sont manquants ou mal renseignés. \nErreur(s): ${segmentErrors.join(
        "\n"
      )}`
    );
  }

  await formRepository.update(
    { id: currentSegment.form.id },
    {
      transportSegments: {
        update: { where: { id }, data: { readyToTakeOver: true } }
      }
    }
  );

  return expandTransportSegmentFromDb({
    ...currentSegment,
    readyToTakeOver: true
  });
}

// when a waste is taken over
export async function takeOverSegment(
  { id, takeOverInfo }: MutationTakeOverSegmentArgs,
  context: GraphQLContext
): Promise<TransportSegment> {
  const user = checkIsAuthenticated(context);

  const inputErrors: string[] = await takeOverInfoSchema
    .validate(takeOverInfo, { abortEarly: false })
    .catch(err => err.errors);

  if (!!inputErrors.length) {
    throw new UserInputError(
      `Erreur, impossible de prendre en charge le bordereau car ces champs ne sont pas renseignés.\nErreur(s): ${inputErrors.join(
        "\n"
      )}`
    );
  }

  const currentSegment = await prisma.transportSegment.findUnique({
    where: { id },
    include: {
      form: {
        select: {
          id: true
        }
      }
    }
  });

  if (!currentSegment) {
    throw new ForbiddenError(SEGMENT_NOT_FOUND);
  }

  const formRepository = getFormRepository(user);
  const form = await formRepository.findUnique(
    { id: currentSegment.form.id },
    formWithOwnerIdAndTransportSegments
  );
  if (form.status !== "SENT") {
    throw new ForbiddenError(FORM_MUST_BE_SENT);
  }

  const userCompaniesSiretOrVat = await getCachedUserSiretOrVat(user.id);

  //   user must be the nextTransporter
  const nexTransporterIsFilled = !!form.nextTransporterSiret;
  if (
    !nexTransporterIsFilled ||
    (nexTransporterIsFilled &&
      !userCompaniesSiretOrVat.includes(form.nextTransporterSiret)) ||
    !userCompaniesSiretOrVat.includes(currentSegment.transporterCompanySiret)
  ) {
    throw new ForbiddenError(FORM_NOT_FOUND_OR_NOT_ALLOWED);
  }

  const segmentErrors: string[] = await segmentSchema
    .validate(currentSegment, { abortEarly: false })
    .catch(err => err.errors);

  if (!!segmentErrors.length) {
    throw new UserInputError(
      `Erreur, impossible de prendre en charge le bordereau car ces champs ne sont pas renseignés, veuillez editer le segment pour le prendre en charge.\nErreur(s): ${segmentErrors.join(
        "\n"
      )}`
    );
  }

  await formRepository.update(
    { id: currentSegment.form.id },
    {
      currentTransporterSiret: currentSegment.transporterCompanySiret,
      nextTransporterSiret: "",
      transportSegments: {
        update: {
          where: { id },
          data: takeOverInfo
        }
      }
    },
    { takeOverSegment: true }
  );

  return expandTransportSegmentFromDb({ ...currentSegment, ...takeOverInfo });
}

/**
 *
 * Edit an existing segment
 * Can be performed by form owner when in DRAFT state, everything is editable,
 * By current transporter if segment is not readyToTakeOver yet, everything is editable
 * By next transporter if segment is readyToTakeOver and not taken over, siret is not editable

 */
export async function editSegment(
  { id, siret: userSiret, nextSegmentInfo }: MutationEditSegmentArgs,
  context: GraphQLContext
): Promise<TransportSegment> {
  const user = checkIsAuthenticated(context);

  const currentSegment = await prisma.transportSegment.findUnique({
    where: { id },
    include: {
      form: {
        select: {
          id: true
        }
      }
    }
  });

  if (!currentSegment) {
    throw new ForbiddenError(SEGMENT_NOT_FOUND);
  }

  const nextSegmentPayload = flattenTransportSegmentInput(nextSegmentInfo);

  // check user owns siret

  const userCompaniesSiretOrVat = await getCachedUserSiretOrVat(user.id);

  if (!userCompaniesSiretOrVat.includes(userSiret)) {
    throw new ForbiddenError(FORM_NOT_FOUND_OR_NOT_ALLOWED);
  }

  const formRepository = getFormRepository(user);
  const form = (await formRepository.findUnique(
    { id: currentSegment.form.id },
    formWithOwnerIdAndTransportSegments
  )) as MultiModalForm;

  const userIsOwner = user.id === form.owner.id;
  const userIsCurrentTransporter = userSiret === form.currentTransporterSiret;
  const userIsNextTransporter = userSiret === form.nextTransporterSiret;

  // segments can be edited by form transporter when form is sent
  const transporterIsForbiddenToEditSentForm =
    userIsCurrentTransporter && form.status !== "SENT";

  // segments can be edited by form owners when form is draft
  const ownerIsForbiddenToEditDraftForm =
    userIsOwner && form.status !== "DRAFT";

  // current transporter can edit until segment is readyToTakeOver
  const currentTransporterIsForbiddenToEditReadyToTakeOverSegment =
    userIsCurrentTransporter && currentSegment.readyToTakeOver;

  // the first statement (!userIsCurrentTransporter) allows a transporter to edit segment if it is assigned to him
  const nextTransporterIsForbiddenToEditDraftSegment =
    !userIsCurrentTransporter &&
    userIsNextTransporter &&
    !currentSegment.readyToTakeOver;

  // as user can be transporter and form owner, we dont want to forbid at first failing condition
  if (
    transporterIsForbiddenToEditSentForm &&
    ownerIsForbiddenToEditDraftForm &&
    currentTransporterIsForbiddenToEditReadyToTakeOverSegment
  ) {
    if (transporterIsForbiddenToEditSentForm) {
      throw new ForbiddenError(FORM_MUST_BE_SENT);
    }
    if (ownerIsForbiddenToEditDraftForm) {
      throw new ForbiddenError(FORM_MUST_BE_DRAFT);
    }
    if (currentTransporterIsForbiddenToEditReadyToTakeOverSegment) {
      throw new ForbiddenError("Ce segment ne peut plus être modifié");
    }
    if (nextTransporterIsForbiddenToEditDraftSegment) {
      throw new ForbiddenError(
        "Ce segment ne peut pas être modifié tant qu'il n'est pas scellé par le tranporteur précédent"
      );
    }
  }

  // siret can't be edited once segment is marked as ready
  if (
    currentSegment.readyToTakeOver &&
    !!nextSegmentPayload.transporterCompanySiret &&
    nextSegmentPayload.transporterCompanySiret !==
      currentSegment.transporterCompanySiret
  ) {
    throw new ForbiddenError("Le siret ne peut pas être modifié");
  }

  await formRepository.update(
    { id: currentSegment.form.id },
    {
      nextTransporterSiret: nextSegmentPayload.transporterCompanySiret,
      transportSegments: {
        update: {
          where: { id },
          data: nextSegmentPayload
        }
      }
    },
    { editSegment: true }
  );
  return expandTransportSegmentFromDb({
    ...currentSegment,
    ...nextSegmentPayload
  });
}
