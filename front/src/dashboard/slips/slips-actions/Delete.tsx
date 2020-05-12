import React, { useState } from "react";
import { FaTrash } from "react-icons/fa";
import mutations from "./slip-actions.mutations";
import { GET_SLIPS } from "../query";
import { currentSiretService } from "../../CompanySelector";
import { useMutation } from "@apollo/react-hooks";
import { updateApolloCache } from "../../../common/helper";
import {
  Form,
  Mutation,
  MutationDuplicateFormArgs,
} from "../../../generated/graphql/types";

type Props = { formId: string };

export default function Delete({ formId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteForm] = useMutation<
    Pick<Mutation, "deleteForm">,
    MutationDuplicateFormArgs
  >(mutations.DELETE_FORM, {
    variables: { id: formId },
    update: (store, { data }) => {
      if (data?.deleteForm) {
        const deleteForm = data.deleteForm;
        updateApolloCache<{ forms: Form[] }>(store, {
          query: GET_SLIPS,
          variables: { siret: currentSiretService.getSiret() },
          getNewData: (data) => ({
            forms: [...data.forms.filter((f) => f.id !== deleteForm.id)],
          }),
        });
      }
    },
  });

  return (
    <>
      <button
        className="icon"
        title="Supprimer définitivement"
        onClick={() => setIsOpen(true)}
      >
        <FaTrash />
      </button>
      <div
        className="modal__backdrop"
        id="modal"
        style={{ display: isOpen ? "flex" : "none" }}
      >
        <div className="modal">
          <h3>Confirmer la suppression ?</h3>
          <p>Cette action est irréversible.</p>
          <button className="button warning" onClick={() => setIsOpen(false)}>
            Annuler
          </button>
          <button className="button" onClick={() => deleteForm()}>
            Supprimer
          </button>
        </div>
      </div>
    </>
  );
}
