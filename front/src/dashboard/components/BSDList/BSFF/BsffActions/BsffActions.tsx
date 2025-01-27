import * as React from "react";
import { Link, generatePath, useParams, useLocation } from "react-router-dom";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuLink,
  MenuItem,
} from "@reach/menu-button";
import "@reach/menu-button/styles.css";
import classNames from "classnames";
import routes from "common/routes";
import {
  IconChevronDown,
  IconChevronUp,
  IconView,
  IconPaperWrite,
  IconPdf,
  IconTrash,
  IconDuplicateFile,
} from "common/components/Icons";
import { BsffStatus } from "generated/graphql/types";
import { BsffFragment } from "../types";
import { DeleteBsffModal } from "./DeleteModal";
import { useDownloadPdf } from "./useDownloadPdf";
import { TableRoadControlButton } from "../../RoadControlButton";
import { useDuplicate } from "./useDuplicate";

import styles from "../../BSDActions.module.scss";
import { Loader } from "common/components";

interface BsffActionsProps {
  form: BsffFragment;
}

export const BsffActions = ({ form }: BsffActionsProps) => {
  const { siret } = useParams<{ siret: string }>();
  const location = useLocation();

  const [duplicateBsff, { loading: isDuplicating }] = useDuplicate({
    variables: { id: form.id },
  });
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [downloadPdf] = useDownloadPdf({ variables: { id: form.id } });

  const emitterSiret = form.bsffEmitter?.company?.siret;
  const transporterSiret = form.bsffTransporter?.company?.siret;
  const destinationSiret = form.bsffDestination?.company?.siret;
  const canWrite = [emitterSiret, transporterSiret, destinationSiret].includes(
    siret
  );

  return (
    <>
      <Menu>
        {({ isExpanded }) => (
          <>
            <MenuButton
              className={classNames(
                "btn btn--outline-primary",
                styles.BSDDActionsToggle
              )}
            >
              Actions
              {isExpanded ? (
                <IconChevronUp size="14px" color="blueLight" />
              ) : (
                <IconChevronDown size="14px" color="blueLight" />
              )}
            </MenuButton>
            <MenuList
              className={classNames(
                "fr-raw-link fr-raw-list",
                styles.BSDDActionsMenu
              )}
            >
              <MenuLink
                as={Link}
                to={{
                  pathname: generatePath(routes.dashboard.bsffs.view, {
                    siret,
                    id: form.id,
                  }),
                  state: { background: location },
                }}
              >
                <IconView color="blueLight" size="24px" />
                Aperçu
              </MenuLink>
              <TableRoadControlButton siret={siret} form={form} />

              <MenuItem onSelect={() => downloadPdf()}>
                <IconPdf size="24px" color="blueLight" />
                Pdf
              </MenuItem>
              {![BsffStatus.Processed, BsffStatus.Refused].includes(
                form.bsffStatus
              ) &&
                canWrite && (
                  <>
                    <MenuLink
                      as={Link}
                      to={generatePath(routes.dashboard.bsffs.edit, {
                        siret,
                        id: form.id,
                      })}
                    >
                      <IconPaperWrite size="24px" color="blueLight" />
                      Modifier
                    </MenuLink>
                  </>
                )}
              {canWrite && (
                <MenuItem onSelect={() => duplicateBsff()}>
                  <IconDuplicateFile size="24px" color="blueLight" />
                  Dupliquer
                </MenuItem>
              )}
              {form.bsffStatus === BsffStatus.Initial && canWrite && (
                <MenuItem onSelect={() => setIsDeleting(true)}>
                  <IconTrash color="blueLight" size="24px" />
                  Supprimer
                </MenuItem>
              )}
            </MenuList>
          </>
        )}
      </Menu>
      {isDeleting && (
        <DeleteBsffModal
          isOpen
          onClose={() => setIsDeleting(false)}
          formId={form.id}
        />
      )}
      {isDuplicating && <Loader />}
    </>
  );
};
