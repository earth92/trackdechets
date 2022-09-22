/**
 * PRISMA HELPER FUNCTIONS
 */

import prisma from "../prisma";
import { User, Prisma, Company } from "@prisma/client";
import {
  CompanyNotFound,
  TraderReceiptNotFound,
  BrokerReceiptNotFound,
  TransporterReceiptNotFound,
  VhuAgrementNotFound,
  WorkerCertificationNotFound
} from "./errors";
import { CompanyMember } from "../generated/graphql/types";
import { UserInputError } from "apollo-server-express";
import { AppDataloaders } from "../types";

/**
 * Retrieves a company by any unique identifier or throw a CompanyNotFound error
 */
export async function getCompanyOrCompanyNotFound({
  id,
  siret,
  vatNumber
}: Prisma.CompanyWhereUniqueInput) {
  if (!id && !siret) {
    throw new UserInputError(
      "You should specify an id or a siret or a VAT number"
    );
  }
  let where: Prisma.CompanyWhereUniqueInput;
  if (id) {
    where = { id };
  } else if (siret) {
    where = { siret };
  } else if (vatNumber) {
    where = { vatNumber };
  }
  const company = await prisma.company.findUnique({
    where
  });
  if (company == null) {
    throw new CompanyNotFound();
  }
  return company;
}

/**
 * Returns the ICPE associated with this company if any
 * or null otherwise
 * The table installation is generated by the `etl`
 * container where we are consolidating data
 * (join and fuzzy join) from s3ic, irep, gerep
 * and sirene to associate a siret with an ICPE
 * @param siret
 */
export function getInstallation(siret: string) {
  return prisma.installation
    .findFirst({
      where: {
        OR: [
          { s3icNumeroSiret: siret },
          { irepNumeroSiret: siret },
          { gerepNumeroSiret: siret },
          { sireneNumeroSiret: siret }
        ]
      }
    })
    .then(installation => {
      return installation ?? null;
    });
}

/**
 * Returns list of rubriques of an ICPE
 * @param codeS3ic
 */
export function getRubriques(codeS3ic: string) {
  if (codeS3ic) {
    return prisma.rubrique.findMany({ where: { codeS3ic } });
  }
  return Promise.resolve([]);
}

/**
 * Returns list of GEREP declarations of an ICPE
 * @param codeS3ic
 */
export function getDeclarations(codeS3ic: string) {
  if (codeS3ic) {
    return prisma.declaration.findMany({ where: { codeS3ic } });
  }
  return Promise.resolve([]);
}

/**
 * Returns the role (ADMIN or MEMBER) of a user
 * in a company.
 * Returns null if the user is not a member of the company.
 * There should be only one association between a user
 * and a company, so we return the first one
 * @param userId
 * @param siret
 */
export async function getUserRole(userId: string, siret: string) {
  const associations = await prisma.company
    .findUnique({ where: { siret } })
    .companyAssociations({ where: { userId } });

  if (associations.length > 0) {
    return associations[0].role;
  }
  return null;
}

/**
 * Returns true if user belongs to company with either
 * MEMBER or ADMIN role, false otherwise
 * @param user
 */
export async function isCompanyMember(user: User, company: Company) {
  const count = await prisma.companyAssociation.count({
    where: {
      userId: user.id,
      companyId: company.id
    }
  });

  return count >= 1;
}

/**
 * Concat active company users and invited company users
 * @param siret
 */
export async function getCompanyUsers(
  siret: string,
  dataloaders: AppDataloaders
): Promise<CompanyMember[]> {
  const activeUsers = await getCompanyActiveUsers(siret);
  const invitedUsers = await getCompanyInvitedUsers(siret, dataloaders);

  return [...activeUsers, ...invitedUsers];
}

/**
 * Returns company members that already have an account in TD
 * @param siret
 */
export function getCompanyActiveUsers(siret: string): Promise<CompanyMember[]> {
  return prisma.company
    .findUnique({ where: { siret: siret } })
    .companyAssociations({ include: { user: true } })
    .then(associations =>
      associations.map(a => {
        return {
          ...a.user,
          role: a.role,
          isPendingInvitation: false
        };
      })
    );
}

/**
 * Returns users who have been invited to join the company
 * but whose account haven't been created yet
 * @param siret
 */
export async function getCompanyInvitedUsers(
  siret: string,
  dataloaders: AppDataloaders
): Promise<CompanyMember[]> {
  const hashes = await dataloaders.activeUserAccountHashesBySiret.load(siret);
  return hashes.map(h => {
    return {
      id: h.id,
      name: "Invité",
      email: h.email,
      role: h.role,
      isActive: false,
      isPendingInvitation: true
    };
  });
}

/**
 * Returns active company members who are admin
 * of the company
 * @param siret
 */
export async function getCompanyAdminUsers(siret: string) {
  const users = await getCompanyActiveUsers(siret);
  return users.filter(c => c.role === "ADMIN");
}

export async function getTraderReceiptOrNotFound({
  id
}: Prisma.TraderReceiptWhereUniqueInput) {
  const receipt = await prisma.traderReceipt.findUnique({ where: { id } });
  if (receipt == null) {
    throw new TraderReceiptNotFound();
  }
  return receipt;
}

export async function getBrokerReceiptOrNotFound({
  id
}: Prisma.BrokerReceiptWhereUniqueInput) {
  const receipt = await prisma.brokerReceipt.findUnique({ where: { id } });
  if (receipt == null) {
    throw new BrokerReceiptNotFound();
  }
  return receipt;
}

export async function getTransporterReceiptOrNotFound({
  id
}: Prisma.TransporterReceiptWhereUniqueInput) {
  const receipt = await prisma.transporterReceipt.findUnique({ where: { id } });
  if (receipt == null) {
    throw new TransporterReceiptNotFound();
  }
  return receipt;
}

export async function getVhuAgrementOrNotFound({
  id
}: Prisma.VhuAgrementWhereUniqueInput) {
  const agrement = await prisma.vhuAgrement.findUnique({ where: { id } });
  if (agrement == null) {
    throw new VhuAgrementNotFound();
  }
  return agrement;
}

export async function getWorkerCertificationOrNotFound({
  id
}: Prisma.WorkerCertificationWhereUniqueInput) {
  const agrement = await prisma.workerCertification.findUnique({
    where: { id }
  });
  if (agrement == null) {
    throw new WorkerCertificationNotFound();
  }
  return agrement;
}

export function convertUrls<T extends Partial<Company>>(
  company: T
): T & { ecoOrganismeAgreements: URL[] } {
  if (!company) {
    return null;
  }

  return {
    ...company,
    ...(company?.ecoOrganismeAgreements && {
      ecoOrganismeAgreements: company.ecoOrganismeAgreements.map(
        a => new URL(a)
      )
    })
  };
}
