import { gql } from "@apollo/client";
import { companyFragment, dashboardCompanyFragment } from "./company";

const signatureFragment = gql`
  fragment SignatureFragment on BsdasriSignature {
    date
    author
  }
`;

export const pickupSiteFragment = gql`
  fragment PickupSiteFragment on PickupSite {
    name
    address
    city
    postalCode
    infos
  }
`;
const dasriEmissionWasteDetailsFragment = gql`
  fragment DasriEmissionWasteDetailsFragment on BsdasriEmission {
    weight {
      value
      isEstimate
    }
    volume
    packagings {
      type
      other
      quantity
      volume
    }
  }
`;
const dasriTransportWasteDetailsFragment = gql`
  fragment DasriTransportWasteDetailsFragment on BsdasriTransport {
    weight {
      value
      isEstimate
    }
    volume
    packagings {
      type
      other
      quantity
      volume
    }
  }
`;
const dasriReceptionWasteDetailsFragment = gql`
  fragment DasriReceptionWasteDetailsFragment on BsdasriReception {
    volume
    packagings {
      type
      other
      quantity
      volume
    }
  }
`;

const initialDasriFragment = gql`
  fragment InitialDasriFragment on InitialBsdasri {
    id
    quantity
    volume
    weight
    takenOverAt
    postalCode
  }
`;

const wasteAcceptationFragment = gql`
  fragment WasteAcceptationFragment on BsdasriWasteAcceptation {
    status
    refusalReason
    refusedWeight
  }
`;

// This fragment query only the fields required for dashboard and workflow action button
// Would you need to query more fields, pay attention sub resolvers which
// might make unwanted db queries
export const dashboardDasriFragment = gql`
  fragment DashboardDasriFragment on Bsdasri {
    id
    bsdasriStatus: status
    type
    isDraft
    bsdasriWaste: waste {
      code
    }
    emitter {
      company {
        ...DashboardCompanyFragment
      }
      emission {
        isTakenOverWithoutEmitterSignature
        isTakenOverWithSecretCode
      }
    }
    ecoOrganisme {
      siret
      emittedByEcoOrganisme
    }
    transporter {
      company {
        ...DashboardCompanyFragment
      }
      customInfo
      transport {
        plates
      }
    }
    destination {
      company {
        ...DashboardCompanyFragment
      }
    }
    grouping {
      id
    }
    synthesizing {
      id
    }
    createdAt
    updatedAt
    allowDirectTakeOver
    synthesizedIn {
      id
    }
  }
  ${dashboardCompanyFragment}
`;

export const fullDasriFragment = gql`
  fragment DasriFragment on Bsdasri {
    id
    bsdasriStatus: status
    type
    isDraft
    identification {
      numbers
    }
    waste {
      adr
      code
    }
    emitter {
      company {
        ...CompanyFragment
      }
      pickupSite {
        ...PickupSiteFragment
      }
      customInfo

      emission {
        isTakenOverWithoutEmitterSignature
        isTakenOverWithSecretCode

        ...DasriEmissionWasteDetailsFragment

        signature {
          ...SignatureFragment
        }
      }
    }
    ecoOrganisme {
      name
      siret
      emittedByEcoOrganisme
    }
    transporter {
      company {
        ...CompanyFragment
      }
      recepisse {
        number
        department
        validityLimit
      }

      customInfo
      transport {
        mode
        plates
        handedOverAt
        takenOverAt

        ...DasriTransportWasteDetailsFragment

        acceptation {
          ...WasteAcceptationFragment
        }
        signature {
          ...SignatureFragment
        }
      }
    }

    destination {
      company {
        ...CompanyFragment
      }
      customInfo
      reception {
        ...DasriReceptionWasteDetailsFragment

        acceptation {
          ...WasteAcceptationFragment
        }

        signature {
          ...SignatureFragment
        }
        date
      }
      operation {
        weight {
          value
        }
        code
        date
        signature {
          ...SignatureFragment
        }
      }
    }
    grouping {
      ...InitialDasriFragment
    }
    synthesizing {
      ...InitialDasriFragment
    }
    synthesizedIn {
      id
    }
    createdAt
    updatedAt
    allowDirectTakeOver
  }
  ${companyFragment}
  ${signatureFragment}
  ${pickupSiteFragment}

  ${dasriEmissionWasteDetailsFragment}
  ${dasriTransportWasteDetailsFragment}
  ${dasriReceptionWasteDetailsFragment}
  ${wasteAcceptationFragment}
  ${initialDasriFragment}
`;
