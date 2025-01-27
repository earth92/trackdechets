import { gql } from "@apollo/client";

export const companyFragment = gql`
  fragment CompanyFragment on FormCompany {
    name
    siret
    vatNumber
    address
    contact
    country
    phone
    mail
    omiNumber
  }
`;

export const dashboardCompanyFragment = gql`
  fragment DashboardCompanyFragment on FormCompany {
    name
    siret
    vatNumber
    omiNumber
  }
`;
