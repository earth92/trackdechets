import { gql } from "@apollo/client";
import { companyFragment } from "./company";

export const workSiteFragment = gql`
  fragment WorkSiteFragment on WorkSite {
    name
    address
    city
    postalCode
    infos
  }
`;
const emitterFragment = gql`
  fragment EmitterFragment on Emitter {
    type
    workSite {
      ...WorkSiteFragment
    }
    company {
      ...CompanyFragment
    }
    isPrivateIndividual
    isForeignShip
  }
  ${companyFragment}
  ${workSiteFragment}
`;

const recipientFragment = gql`
  fragment RecipientFragment on Recipient {
    cap
    processingOperation
    isTempStorage
    company {
      ...CompanyFragment
    }
  }
  ${companyFragment}
`;

const traderFragment = gql`
  fragment TraderFragment on Trader {
    receipt
    department
    validityLimit
    company {
      ...CompanyFragment
    }
  }
  ${companyFragment}
`;

const brokerFragment = gql`
  fragment BrokerFragment on Broker {
    receipt
    department
    validityLimit
    company {
      ...CompanyFragment
    }
  }
  ${companyFragment}
`;

export const wasteDetailsFragment = gql`
  fragment WasteDetailsFragment on WasteDetails {
    code
    name
    onuCode
    packagingInfos {
      type
      other
      quantity
    }
    quantity
    quantityType
    consistence
    pop
    isDangerous
    parcelNumbers {
      city
      postalCode
      prefix
      section
      number
      x
      y
    }
    analysisReferences
    landIdentifiers
  }
`;

export const transporterFragment = gql`
  fragment TransporterFragment on Transporter {
    isExemptedOfReceipt
    receipt
    department
    validityLimit
    numberPlate
    customInfo
    mode
    company {
      ...CompanyFragment
    }
  }
  ${companyFragment}
`;

export const temporaryStorageDetailFragment = gql`
  fragment TemporaryStorageDetailFragment on TemporaryStorageDetail {
    emittedAt
    emittedAt
    takenOverAt
    takenOverBy
    temporaryStorer {
      quantityType
      quantityReceived
      wasteAcceptationStatus
      wasteRefusalReason
      receivedAt
      receivedBy
    }
    destination {
      company {
        ...CompanyFragment
      }
      cap
      processingOperation
      isFilledByEmitter
    }
    wasteDetails {
      onuCode
      packagingInfos {
        type
        other
        quantity
      }
      quantity
      quantityType
    }
    transporter {
      ...TransporterFragment
    }
  }
  ${companyFragment}
  ${transporterFragment}
`;

export const segmentFragment = gql`
  fragment Segment on TransportSegment {
    id
    readyToTakeOver
    transporter {
      validityLimit
      numberPlate
      isExemptedOfReceipt
      department
      receipt
      company {
        siret
        name
        address
        contact
        mail
        phone
      }
    }
    mode
    takenOverAt
    takenOverBy
    previousTransporterCompanySiret
    segmentNumber
  }
`;
export const staticFieldsFragment = gql`
  fragment StaticFieldsFragment on Form {
    readableId
    customId
    createdAt
    status
    stateSummary {
      packagingInfos {
        type
        other
        quantity
      }
      onuCode
      quantity
      transporterNumberPlate
      transporterCustomInfo
      transporter {
        ...CompanyFragment
      }
      recipient {
        ...CompanyFragment
      }
      emitter {
        ...CompanyFragment
      }
      lastActionOn
    }
  }
  ${companyFragment}
`;

const mutableFieldsFragment = gql`
  fragment MutableFieldsFragment on Form {
    id
    customId
    sentAt
    emittedAt
    emittedBy
    emittedByEcoOrganisme
    takenOverAt
    takenOverBy
    emitter {
      ...EmitterFragment
    }
    recipient {
      ...RecipientFragment
    }
    transporter {
      ...TransporterFragment
    }
    trader {
      ...TraderFragment
    }
    broker {
      ...BrokerFragment
    }
    wasteDetails {
      ...WasteDetailsFragment
    }
    grouping {
      quantity
      form {
        id
        readableId
        wasteDetails {
          code
          name
          quantity
          packagingInfos {
            type
            other
            quantity
          }
        }
        emitter {
          company {
            name
          }
        }
        recipient {
          company {
            siret
          }
        }
        signedAt
        quantityReceived
        quantityGrouped
        processingOperationDone
      }
    }
    quantityGrouped
    ecoOrganisme {
      name
      siret
    }
    temporaryStorageDetail {
      destination {
        company {
          siret
        }
      }
    }
    temporaryStorageDetail {
      ...TemporaryStorageDetailFragment
    }
    currentTransporterSiret
    nextTransporterSiret
    transportSegments {
      ...Segment
    }
    intermediaries {
      ...CompanyFragment
    }
  }
  ${traderFragment}
  ${brokerFragment}
  ${transporterFragment}
  ${temporaryStorageDetailFragment}
  ${wasteDetailsFragment}
  ${emitterFragment}
  ${recipientFragment}
  ${segmentFragment}
  ${companyFragment}
`;
export const fullFormFragment = gql`
  fragment FullForm on Form {
    ...MutableFieldsFragment
    ...StaticFieldsFragment
  }
  ${mutableFieldsFragment}
  ${staticFieldsFragment}
`;

export const transporterFormFragment = gql`
  fragment TransporterFormFragment on Form {
    ...MutableFieldsFragment
    ...StaticFieldsFragment
    currentTransporterSiret
    nextTransporterSiret
    transportSegments {
      ...Segment
    }
  }
  ${mutableFieldsFragment}
  ${staticFieldsFragment}
  ${segmentFragment}
`;

export const detailFormFragment = gql`
  fragment DetailFormFragment on Form {
    ...TransporterFormFragment
    sentAt
    sentBy
    signedByTransporter
    processedAt
    receivedAt
    receivedBy
    quantityReceived
    wasteAcceptationStatus
    wasteRefusalReason
    signedAt
    processedBy
    processedAt
    processingOperationDescription
    processingOperationDone
    ecoOrganisme {
      siret
      name
    }
    groupedIn {
      quantity
      form {
        id
        readableId
      }
    }
    grouping {
      quantity
      form {
        readableId
        wasteDetails {
          code
          name
          quantity
        }
        quantityReceived
        signedAt
        emitterPostalCode
      }
    }
    quantityGrouped
    intermediaries {
      name
      siret
      vatNumber
      phone
      contact
      mail
      address
    }
  }
  ${transporterFormFragment}
`;

export const statusChangeFragment = gql`
  fragment StatusChange on Form {
    id
    status
  }
`;

// This fragment query only the fields required for dashboard and workflow action button
// Would you need to query more fields, pay attention sub resolvers which
// might make unwanted db queries
export const dashboardFormFragment = gql`
  fragment DashboardFormFragment on Form {
    id
    readableId
    customId
    sentAt
    emittedAt
    emittedBy
    emittedByEcoOrganisme
    takenOverAt
    status
    wasteDetails {
      code
      name
      packagingInfos {
        type
        other
        quantity
      }
    }
    emitter {
      type
      isPrivateIndividual
      company {
        siret
        name
        omiNumber
      }
      isPrivateIndividual
      isForeignShip
    }
    recipient {
      company {
        siret
        name
      }
      isTempStorage
    }
    transporter {
      company {
        siret
      }
      numberPlate
      customInfo
    }
    ecoOrganisme {
      siret
    }
    stateSummary {
      transporterCustomInfo
      transporterNumberPlate
      transporter {
        siret
        name
      }
      recipient {
        siret
        name
      }
      emitter {
        siret
        name
      }
      transporterNumberPlate
    }
    temporaryStorageDetail {
      destination {
        company {
          siret
          address
          name
          contact
          phone
          mail
        }
        cap
        processingOperation
      }
      transporter {
        company {
          siret
          vatNumber
          address
          name
          contact
          phone
          mail
        }
      }
      wasteDetails {
        packagingInfos {
          type
          other
          quantity
        }
        quantity
        quantityType
      }
    }
    transportSegments {
      id
      readyToTakeOver
      previousTransporterCompanySiret
      takenOverAt
    }
    currentTransporterSiret
    nextTransporterSiret
  }
`;
