import { useQuery } from "@apollo/react-hooks";
import gql from "graphql-tag";
import React, { useContext, useState } from "react";
import { FaSort, FaSync } from "react-icons/fa";
import {
  Form,
  FormRole,
  FormStatus,
  Query,
  QueryFormsArgs,
} from "../../generated/graphql/types";
import SealSegment from "./SealSegment";
import PrepareSegment from "./PrepareSegment";
import TakeOverSegment from "./TakeOverSegment";
import EditSegment from "./EditSegment";
import { SiretContext } from "../Dashboard";
import DownloadPdf from "../slips/slips-actions/DownloadPdf";
import { useFormsTable } from "../slips/use-forms-table";
import useLocalStorage from "./hooks";
import "./Transport.scss";
import TransporterInfoEdit from "./TransporterInfoEdit";
import TransportSignature from "./TransportSignature";
import { Segments } from "./Segments";
import { transporterFormFragment } from "../../common/fragments";

export const GET_TRANSPORT_SLIPS = gql`
  query GetSlips($siret: String, $status: [FormStatus!], $roles: [FormRole!]) {
    forms(siret: $siret, status: $status, roles: $roles) {
      ...TransporterForm
    }
  }
  ${transporterFormFragment}
`;

const Table = ({ forms, userSiret }) => {
  const [sortedForms, sortBy, filter] = useFormsTable(forms);
  const refetchQuery = {
    query: GET_TRANSPORT_SLIPS,
    variables: {
      siret: userSiret,
      roles: ["TRANSPORTER"],
      status: ["SEALED", "SENT", "RESEALED", "RESENT"],
    },
  };

  return (
    <table className="table transport-table">
      <thead>
        <tr>
          <th className="sortable" onClick={() => sortBy("readableId")}>
            Numéro{" "}
            <small>
              <FaSort />
            </small>
          </th>
          <th
            className="sortable"
            onClick={() => sortBy("emitter.company.name")}
          >
            Emetteur{" "}
            <small>
              <FaSort />
            </small>
          </th>
          <th
            className="sortable hide-on-mobile"
            onClick={() => sortBy("stateSummary.recipient.name")}
          >
            Destinataire{" "}
            <small>
              <FaSort />
            </small>
          </th>

          <th>Déchet</th>
          <th className="hide-on-mobile">Quantité estimée</th>
          <th colSpan={2}>Champ libre</th>
          <th colSpan={2}>Plaque d'immatriculation</th>
          <th>Multimodal</th>
          <th>Action</th>
        </tr>
        <tr>
          <th>
            <input
              type="text"
              onChange={(e) => filter("readableId", e.target.value)}
              placeholder="Filtrer..."
            />
          </th>
          <th>
            <input
              type="text"
              onChange={(e) => filter("emitter.company.name", e.target.value)}
              placeholder="Filtrer..."
            />
          </th>
          <th className="hide-on-mobile">
            <input
              type="text"
              onChange={(e) =>
                filter("stateSummary.recipient.name", e.target.value)
              }
              placeholder="Filtrer..."
            />
          </th>
          <th>
            <input
              type="text"
              onChange={(e) => filter("wasteDetails.name", e.target.value)}
              placeholder="Filtrer..."
            />
          </th>
          <th className="hide-on-mobile"></th>

          <th colSpan={6}></th>
        </tr>
      </thead>
      <tbody>
        {sortedForms.map((form) => {
          const transportInfos = getTransportInfos(form);
          return (
            <tr key={form.id}>
              <td>
                <div className="readable-id">
                  {form.readableId}
                  <DownloadPdf formId={form.id} />
                </div>
              </td>
              <td>{form.stateSummary?.emitter?.name}</td>
              <td className="hide-on-mobile">
                {form.stateSummary?.recipient?.name}
              </td>
              <td>
                <div>{form.wasteDetails?.name}</div>
              </td>
              <td className="hide-on-mobile">
                {form.stateSummary?.quantity} tonnes
              </td>
              <td>{form.stateSummary?.transporterCustomInfo}</td>
              <td style={{ paddingLeft: 0, paddingRight: 0 }}>
                {
                  <TransporterInfoEdit
                    form={form}
                    fieldName="customInfo"
                    title={"Modifier le champ libre"}
                    refetchQuery={refetchQuery}
                  />
                }
              </td>
              <td>{form.stateSummary?.transporterNumberPlate}</td>
              <td style={{ paddingLeft: 0 }}>
                {
                  <TransporterInfoEdit
                    form={form}
                    fieldName="numberPlate"
                    title={"Modifier la plaque d'immatriculation"}
                    refetchQuery={refetchQuery}
                  />
                }
              </td>
              <td>
                <Segments
                  form={form}
                  userSiret={userSiret}
                />
              </td>
              <td>
    
                  <TransportSignature form={transportInfos}  userSiret={userSiret}/>
 
                <PrepareSegment form={transportInfos} userSiret={userSiret} />
                <SealSegment form={transportInfos} userSiret={userSiret} />
                <EditSegment form={transportInfos} userSiret={userSiret} />
                <TakeOverSegment
                  form={form}
                  userSiret={userSiret}
                  refetchQuery={refetchQuery}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
const TRANSPORTER_FILTER_STORAGE_KEY = "TRANSPORTER_FILTER_STORAGE_KEY";

export default function Transport() {
  const { siret } = useContext(SiretContext);
  // const [filterStatus, setFilterStatus] = useState(["SEALED", "RESEALED"]);
  const [filterFormType, setFilterFormType] = useState({
    formType: "TO_TAKE_OVER",
  });
  const [persistentFilter, setPersistentFilter] = useLocalStorage(
    TRANSPORTER_FILTER_STORAGE_KEY
  );
  const { loading, error, data, refetch } = useQuery<
    Pick<Query, "forms">,
    Partial<QueryFormsArgs>
  >(GET_TRANSPORT_SLIPS, {
    variables: {
      siret,
      status: [
        FormStatus.Sealed,
        FormStatus.Sent,
        FormStatus.Resealed,
        FormStatus.Resent,
      ],
      roles: [FormRole.Transporter],
    },
  });

  if (loading) return <div>loading</div>;
  if (error) return <div>error</div>;

  const filterAgainstPersistenFilter = (field, filterParam) => {
    field = !field ? "" : field;
    return field.toLowerCase().indexOf(filterParam.toLowerCase()) > -1;
  };

  const filtering = (form, formType, userSiret) => {
    const statuses = {
      TO_TAKE_OVER: ["SEALED", "RESEALED"],
      TAKEN_OVER: ["SENT", "RESENT"],
    }[formType];

    const segmentsToTakeOver = form.transportSegments.filter(
      (segment) =>
        segment.sealed &&
        !segment.takenOverAt &&
        segment.transporter.company.siret === userSiret
    );

    const lastSegment =
      form.transportSegments[form.transportSegments.length - 1];

    const hasTakenOverASegment = form.transportSegments.filter(
      (segment) =>
        segment.transporter.company.siret === userSiret && !!segment.takenOverAt
    );

    return (
      (statuses.includes(form.status) &&
        form.transporter.company.siret === siret) ||
      (formType === "TO_TAKE_OVER" &&
        form.status === "SENT" &&
        !!segmentsToTakeOver.length) ||
      (formType === "TAKEN_OVER" &&
        form.status === "SENT" &&
        hasTakenOverASegment)
    );
  };

  // filter forms by status and concatenate waste code and name to ease searching
  const filteredForms = data
    ? data.forms
        .filter(
          (f) =>
            filtering(f, filterFormType.formType, siret) &&
            filterAgainstPersistenFilter(
              f.stateSummary?.transporterCustomInfo,
              persistentFilter
            )
        )
        .map((f) => ({
          ...f,
          wasteDetails: {
            ...f.wasteDetails,
            name: `${f.wasteDetails?.code} ${f.wasteDetails?.name} `,
          },
        }))
    : [];
  return (
    <div>
      <div className="header-content">
        <h2>Déchets à transporter</h2>
      </div>

      <div className="transport-menu">
        <button
          onClick={() => setFilterFormType({ formType: "TO_TAKE_OVER" })}
          className={`link ${
            filterFormType.formType === "TO_TAKE_OVER" ? "active" : ""
          }`}
        >
          Déchets à collecter
        </button>
        <button
          onClick={() => setFilterFormType({ formType: "TAKEN_OVER" })}
          className={`link ${
            filterFormType.formType === "TAKEN_OVER" ? "active" : ""
          }`}
        >
          Déchets chargés, en attente de réception
        </button>
        <button
          className="button button-primary transport-refresh"
          onClick={() =>
            refetch({
              siret,
              status: [
                FormStatus.Sealed,
                FormStatus.Sent,
                FormStatus.Resealed,
                FormStatus.Resent,
              ],
              roles: [FormRole.Transporter],
            })
          }
        >
          <FaSync /> Rafraîchir
        </button>
      </div>

      <div className="transporter-permanent-filter form__group">
        <input
          type="text"
          placeholder="Filtre champ libre…"
          value={persistentFilter}
          onChange={(e) => setPersistentFilter(e.target.value)}
        />

        {persistentFilter && (
          <button
            className="button-outline warning"
            onClick={(e) => setPersistentFilter("")}
          >
            Afficher tous les bordereaux
          </button>
        )}
      </div>

      <Table
        forms={filteredForms}
        userSiret={siret}
        // displayActions={filterFormType.formType.includes("TO_TAKE_OVER")}
      />
    </div>
  );
}

function getTransportInfos(form: Form) {
  if (!form.temporaryStorageDetail) {
    return form;
  }

  return {
    ...form,
    emitter: {
      ...form.emitter,
      ...form.recipient,
    },
    recipient: {
      ...form.recipient,
      ...form.temporaryStorageDetail.destination,
    },
    wasteDetails: {
      ...form.wasteDetails,
      ...(form.temporaryStorageDetail?.wasteDetails?.quantity &&
        form.temporaryStorageDetail.wasteDetails),
    },
  };
}
