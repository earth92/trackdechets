import { hash } from "bcrypt";
import getReadableId from "../forms/readableId";
import {
  CompanyType,
  Consistence,
  EmitterType,
  QuantityType,
  Status,
  UserRole,
  User,
  Prisma,
  Company
} from "@prisma/client";
import prisma from "../prisma";
import { hashToken } from "../utils";
import { createUser } from "../users/database";
/**
 * Create a user with name and email
 * @param opt: extra parameters
 */
export const userFactory = async (
  opt: Partial<Prisma.UserCreateInput> = {}
) => {
  const defaultPassword = await hash("pass", 10);
  const userIndex = (await prisma.user.count()) + 1;
  const data = {
    name: `User_${userIndex}`,
    email: `user_${userIndex}@td.io`,
    password: defaultPassword,
    isActive: true,
    ...opt
  };

  return createUser({ data });
};

/**
 * Left pad a given index with 0s
 * @param index numerical index
 */
function siretify(index) {
  const siretLength = 14;
  const siret = `${index}`;
  if (siret.length === siretLength) {
    return siret;
  }
  if (siret.length > siretLength) {
    throw Error("Generated siret is too long");
  }
  return siret.padStart(14, "9");
}

/**
 * Create a company with name, siret, security code and PRODUCER by default
 * @param opt: extram parameters
 */
export const companyFactory = async (
  companyOpts: Partial<Prisma.CompanyCreateInput> = {}
) => {
  const opts = companyOpts || {};

  const companyIndex = (await prisma.company.count()) + 1;
  return prisma.company.create({
    data: {
      siret: siretify(companyIndex),
      companyTypes: {
        set: ["PRODUCER", "TRANSPORTER", "WASTEPROCESSOR"]
      },
      name: `company_${companyIndex}`,
      securityCode: 1234,
      verificationCode: "34567",
      address: "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
      codeDepartement: "75",
      contactEmail: `contact_${companyIndex}@gmail.com`,
      contactPhone: `+${companyIndex} 606060606`,
      verificationStatus: "VERIFIED",
      ...opts
    }
  });
};

/**
 * Create a company with name, siret, security code and PRODUCER by default
 * and associate that company to the user
 * @param opt: extram parameters
 */
export const companyAssociatedToExistingUserFactory = async (
  user: User,
  role: UserRole,
  companyOpts: Partial<Prisma.CompanyCreateInput> = {}
) => {
  const company = await companyFactory(companyOpts);

  await prisma.companyAssociation.create({
    data: {
      company: { connect: { id: company.id } },
      user: { connect: { id: user.id } },
      role
    }
  });

  return company;
};

export interface UserWithCompany {
  user: User;
  company: Company;
}

/**
 * Create a company and a member
 * @param role: user role in the company
 */
export const userWithCompanyFactory = async (
  role: UserRole,
  companyOpts: Partial<Prisma.CompanyCreateInput> = {}
): Promise<UserWithCompany> => {
  const company = await companyFactory(companyOpts);

  const user = await userFactory({
    companyAssociations: {
      create: {
        company: { connect: { siret: company.siret } },
        role: role as UserRole
      }
    }
  });
  return { user, company };
};

export const destinationFactory = async (
  companyOpts: Partial<Prisma.CompanyCreateInput> = {}
) => {
  const { company: destination } = await userWithCompanyFactory(
    UserRole.MEMBER,
    {
      ...companyOpts,
      companyTypes: {
        set: [CompanyType.WASTEPROCESSOR]
      }
    }
  );
  return destination;
};

/**
 * Create a user and an accessToken
 * @param opt : extra parameters for user
 */
export const userWithAccessTokenFactory = async (opt = {}) => {
  const user = await userFactory(opt);

  const accessTokenIndex = (await prisma.accessToken.count()) + 1;
  const clearToken = `token_${accessTokenIndex}`;
  await prisma.accessToken.create({
    data: {
      token: hashToken(clearToken),
      user: { connect: { id: user.id } }
    }
  });
  return { user, accessToken: clearToken };
};

const formdata = {
  brokerCompanyAddress: "",
  brokerCompanyContact: "",
  brokerCompanyMail: "",
  brokerCompanyName: "",
  brokerCompanyPhone: "",
  brokerCompanySiret: "",
  customId: null,
  emitterCompanyAddress: "20 Avenue de la 1ère Dfl 13000 Marseille",
  emitterCompanyContact: "Marc Martin",
  emitterCompanyMail: "emitter@compnay.fr",
  emitterCompanyName: "WASTE PRODUCER",
  emitterCompanyPhone: "06 18 76 02 96",
  emitterCompanySiret: "15397456982146",
  emitterType: "PRODUCER" as EmitterType,
  emitterWorkSiteAddress: "",
  emitterWorkSiteCity: "",
  emitterWorkSiteInfos: "",
  emitterWorkSiteName: "",
  emitterWorkSitePostalCode: "",
  isAccepted: null,
  isDeleted: false,
  nextDestinationCompanyAddress: null,
  nextDestinationCompanyContact: null,
  nextDestinationCompanyMail: null,
  nextDestinationCompanyPhone: null,
  nextDestinationCompanySiret: null,
  nextDestinationProcessingOperation: null,
  noTraceability: null,
  processedAt: null,
  processedBy: null,
  processingOperationDescription: null,
  processingOperationDone: null,
  quantityReceived: null,
  receivedAt: null,
  receivedBy: null,
  recipientCap: "I am a CAP",
  recipientCompanyAddress: "16 rue Jean Jaurès 92400 Courbevoie",
  recipientCompanyContact: "Jean Dupont",
  recipientCompanyMail: "recipient@td.io",
  recipientCompanyName: "WASTE COMPANY",
  recipientCompanyPhone: "06 18 76 02 99",
  recipientCompanySiret: "56847895684123",
  recipientProcessingOperation: "D 6",
  sentAt: "2019-11-20T00:00:00.000Z",
  sentBy: "signe",
  signedByTransporter: true,
  status: "SENT" as Status,
  traderCompanyAddress: "",
  traderCompanyContact: "",
  traderCompanyMail: "",
  traderCompanyName: "",
  traderCompanyPhone: "",
  traderCompanySiret: "",
  traderDepartment: "",
  traderReceipt: "",
  traderValidityLimit: null,
  transporterCompanyAddress: "16 rue Jean Jaurès 92400 Courbevoie",
  transporterCompanyContact: "transporter",
  transporterCompanyMail: "transporter@td.io",
  transporterCompanyName: "WASTE TRANSPORTER",
  transporterCompanyPhone: "06 18 76 02 66",
  transporterCompanySiret: "12345678974589",
  transporterDepartment: "86",
  transporterIsExemptedOfReceipt: false,
  transporterNumberPlate: "aa22",
  transporterReceipt: "33AA",
  transporterValidityLimit: "2019-11-27T00:00:00.000Z",
  wasteAcceptationStatus: null,
  wasteDetailsCode: "05 01 04*",
  wasteDetailsConsistence: "SOLID" as Consistence,
  wasteDetailsIsDangerous: true,
  wasteDetailsName: "Divers",
  wasteDetailsOnuCode: "2003",
  wasteDetailsPackagingInfos: [{ type: "CITERNE", quantity: 1 }],
  wasteDetailsPop: false,
  wasteDetailsQuantity: 22.5,
  wasteDetailsQuantityType: "ESTIMATED" as QuantityType,
  wasteRefusalReason: null
};

export const forwardedInData: Partial<Prisma.FormCreateInput> = {
  quantityReceived: 1,
  wasteAcceptationStatus: "ACCEPTED",
  wasteRefusalReason: null,
  receivedAt: "2019-12-20T00:00:00.000Z",
  receivedBy: "John Dupont",
  signedAt: "2019-12-20T00:00:00.000Z",
  recipientCompanyName: "Incinérateur du Grand Est",
  recipientCompanySiret: "65478235968471",
  recipientCompanyAddress: "4 chemin des déchets, Mulhouse",
  recipientCompanyContact: "Louis Henry",
  recipientCompanyPhone: "0700000000",
  recipientCompanyMail: "louis.henry@idge.org",
  recipientCap: "CAP",
  recipientProcessingOperation: "R 1",
  wasteDetailsOnuCode: "",
  wasteDetailsPackagingInfos: [],
  wasteDetailsQuantity: 1,
  wasteDetailsQuantityType: "ESTIMATED",
  transporterCompanyName: "Transporteur",
  transporterCompanySiret: "36947581236985",
  transporterCompanyAddress: "6 chemin des pneus, 07100 Bourg d'ici",
  transporterCompanyContact: "Mathieu O'connor",
  transporterCompanyPhone: "0700000000",
  transporterCompanyMail: "mathieu@transporteur.org",
  transporterIsExemptedOfReceipt: false,
  transporterReceipt: "xxxxxx",
  transporterDepartment: "07",
  transporterValidityLimit: "2019-11-27T00:00:00.000Z",
  transporterNumberPlate: "AD-007-XX",
  signedByTransporter: true,
  signedBy: "Mathieu O'connor"
};

export const transportSegmentFactory = async ({ formId, segmentPayload }) => {
  return prisma.transportSegment.create({
    data: {
      form: { connect: { id: formId } },
      ...segmentPayload
    }
  });
};

export const upsertBaseSiret = async siret => {
  const exists = await prisma.company.findUnique({ where: { siret } });
  if (!exists) {
    // Using prisma.upsert gives us "Unique constraint failed on the fields: (`siret`)"
    // Instead we create if it didn't exist upon entry, and ignore errors.
    try {
      await prisma.company.create({
        data: {
          siret,
          companyTypes: {
            set: ["TRANSPORTER", "WASTEPROCESSOR"]
          },
          name: `company_${siret}`,
          securityCode: 1234,
          verificationCode: "34567",
          address: "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
          contactEmail: `contact_${siret}@gmail.com`,
          contactPhone: `+${siret}`
        }
      });
    } catch (err) {
      // Must have been already created (race condition). Just ignore
    }
  }
};

export const formFactory = async ({
  ownerId,
  opt = {}
}: {
  ownerId: string;
  opt?: Partial<Prisma.FormCreateInput>;
}) => {
  // Those sirets are required for the form to be updatable
  await upsertBaseSiret(formdata.transporterCompanySiret);
  await upsertBaseSiret(formdata.recipientCompanySiret);

  const formParams = {
    ...formdata,
    ...opt
  };
  return prisma.form.create({
    data: {
      readableId: getReadableId(),
      ...formParams,
      owner: { connect: { id: ownerId } }
    },
    include: { forwardedIn: true }
  });
};

export const formWithTempStorageFactory = async ({
  ownerId,
  opt = {},
  forwardedInOpts = {}
}: {
  ownerId: string;
  opt?: Partial<Prisma.FormCreateInput>;
  forwardedInOpts?: Partial<Prisma.FormCreateInput>;
}) => {
  await upsertBaseSiret(forwardedInData.transporterCompanySiret);
  await upsertBaseSiret(forwardedInData.recipientCompanySiret);

  return formFactory({
    ownerId,
    opt: {
      recipientIsTempStorage: true,
      forwardedIn: {
        create: {
          readableId: getReadableId(),
          owner: { connect: { id: ownerId } },
          ...forwardedInData,
          ...forwardedInOpts
        }
      },
      ...opt
    }
  });
};

export const statusLogFactory = async ({
  status,
  userId,
  formId,
  updatedFields = {},
  opt = {}
}) => {
  return prisma.statusLog.create({
    data: {
      form: { connect: { id: formId } },
      user: { connect: { id: userId } },
      loggedAt: new Date(),
      authType: "SESSION",
      status,
      updatedFields,
      ...opt
    }
  });
};

export const applicationFactory = async () => {
  const admin = await userFactory();

  const applicationIndex = (await prisma.application.count()) + 1;

  const application = await prisma.application.create({
    data: {
      admin: { connect: { id: admin.id } },
      clientSecret: `Secret_${applicationIndex}`,
      name: `Application_${applicationIndex}`,
      redirectUris: ["https://acme.inc/authorize"]
    }
  });

  return application;
};

export const ecoOrganismeFactory = async ({
  count = null,
  handleBsdasri = false
}: {
  count?: number;
  handleBsdasri?: boolean;
}) => {
  const ecoOrganismeIndex = !!count
    ? count + 1
    : (await prisma.ecoOrganisme.count()) + 1;

  const ecoOrganisme = await prisma.ecoOrganisme.create({
    data: {
      address: "",
      name: `Eco-Organisme ${ecoOrganismeIndex}`,
      siret: siretify(ecoOrganismeIndex),
      handleBsdasri
    }
  });

  return ecoOrganisme;
};

export const toIntermediaryCompany = (company: Company, contact = "toto") => ({
  siret: company.siret,
  name: company.name,
  contact
});
