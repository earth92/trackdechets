import React from "react";
import { BsffStatus } from "generated/graphql/types";
import { BsffFragment } from "../types";
import { PublishBsff } from "./PublishBsff";
import { SignEmission } from "./SignEmission";
import { SignTransport } from "./SignTransport";
import { SignReception } from "./SignReception";
import { SignBsffOperationOnePackaging } from "./SignOperation";
import { SignBsffAcceptationOnePackaging } from "./SignAcceptation";
import { SignPackagings } from "./SignPackagings";
import { useParams } from "react-router-dom";

export interface WorkflowActionProps {
  form: BsffFragment;
}

export function WorkflowAction(props: WorkflowActionProps) {
  const { siret } = useParams<{ siret: string }>();
  const { form } = props;

  const emitterSiret = form.bsffEmitter?.company?.siret;
  const transporterSiret = form.bsffTransporter?.company?.siret;
  const destinationSiret = form.bsffDestination?.company?.siret;

  if (
    form.isDraft &&
    [emitterSiret, transporterSiret, destinationSiret].includes(siret)
  ) {
    return <PublishBsff bsffId={form.id} />;
  }

  switch (form.bsffStatus) {
    case BsffStatus.Initial:
      if (siret !== emitterSiret) return null;
      return <SignEmission bsffId={form.id} />;

    case BsffStatus.SignedByEmitter:
      if (siret !== transporterSiret) return null;
      return <SignTransport bsffId={form.id} />;

    case BsffStatus.Sent:
      if (siret !== destinationSiret) return null;
      return <SignReception bsffId={form.id} />;

    case BsffStatus.Received:
      if (siret !== destinationSiret) return null;
      if (form.packagings?.length === 1) {
        return <SignBsffAcceptationOnePackaging bsffId={form.id} />;
      }
      return <SignPackagings bsffId={form.id} />;

    case BsffStatus.Accepted:
      if (siret !== destinationSiret) return null;
      if (form.packagings?.length === 1) {
        return <SignBsffOperationOnePackaging bsffId={form.id} />;
      }
      return <SignPackagings bsffId={form.id} />;

    case BsffStatus.PartiallyRefused:
      if (siret !== destinationSiret) return null;
      return <SignPackagings bsffId={form.id} />;

    default:
      return null;
  }
}
