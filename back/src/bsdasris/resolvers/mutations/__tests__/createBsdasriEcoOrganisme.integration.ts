import { resetDatabase } from "../../../../../integration-tests/helper";
import { ErrorCode } from "../../../../common/errors";
import {
  userWithCompanyFactory,
  companyFactory,
  ecoOrganismeFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { Mutation } from "../../../../generated/graphql/types";
import { fullGroupingBsdasriFragment } from "../../../fragments";
import { gql } from "apollo-server-express";
import prisma from "../../../../prisma";
const CREATE_DASRI = gql`
  ${fullGroupingBsdasriFragment}
  mutation DasriCreate($input: BsdasriInput!) {
    createBsdasri(input: $input) {
      ...FullGroupingBsdasriFragment
    }
  }
`;
describe("Mutation.createDasri", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it("should fail to create a bsdasri with an unregistered ecoorganisme", async () => {
    const { user, company: ecoOrgCompany } = await userWithCompanyFactory(
      "MEMBER",
      {
        siret: "98764321"
      }
    );
    const otherCompany = await companyFactory();
    const input = {
      waste: { adr: "xyz 33", code: "18 01 03*" },
      emitter: {
        company: {
          name: "hopital blanc",
          siret: otherCompany.siret,
          contact: "jean durand",
          phone: "06 18 76 02 00",

          address: "avenue de la mer"
        },
        emission: {
          weight: { value: 23.2, isEstimate: false },

          packagings: [
            {
              type: "BOITE_CARTON",
              volume: 22,
              quantity: 3
            }
          ]
        }
      },

      ecoOrganisme: { siret: ecoOrgCompany.siret, name: "eco-org" }
    };

    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createBsdasri">>(
      CREATE_DASRI,
      {
        variables: {
          input
        }
      }
    );
    expect(errors).toEqual([
      expect.objectContaining({
        message: `L'éco-organisme avec le siret \"${ecoOrgCompany.siret}\" n'est pas reconnu ou n'est pas autorisé à gérer des dasris.`,
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });
  it("should fail to create a bsdasri with an ecoorganisme not allowed to handle dasri", async () => {
    const count = await prisma.company.count();
    const ecoOrg = await ecoOrganismeFactory({ count });
    const { user } = await userWithCompanyFactory("MEMBER", {
      siret: ecoOrg.siret
    });
    const otherCompany = await companyFactory();
    const input = {
      waste: { adr: "xyz 33", code: "18 01 03*" },
      emitter: {
        company: {
          name: "hopital blanc",
          siret: otherCompany.siret,
          contact: "jean durand",
          phone: "06 18 76 02 00",

          address: "avenue de la mer"
        },
        emission: {
          weight: { value: 23.2, isEstimate: false },

          packagings: [
            {
              type: "BOITE_CARTON",
              volume: 22,
              quantity: 3
            }
          ]
        }
      },

      ecoOrganisme: { siret: ecoOrg.siret, name: "eco-org" }
    };

    const { mutate } = makeClient(user);
    const { errors } = await mutate<Pick<Mutation, "createBsdasri">>(
      CREATE_DASRI,
      {
        variables: {
          input
        }
      }
    );
    expect(errors).toEqual([
      expect.objectContaining({
        message: `L'éco-organisme avec le siret \"${ecoOrg.siret}\" n'est pas reconnu ou n'est pas autorisé à gérer des dasris.`,
        extensions: expect.objectContaining({
          code: ErrorCode.BAD_USER_INPUT
        })
      })
    ]);
  });
  it("create a dasri with an eco-organisme (eco-org user)", async () => {
    const count = await prisma.company.count();
    const ecoOrg = await ecoOrganismeFactory({ count, handleBsdasri: true });
    const { user } = await userWithCompanyFactory("MEMBER", {
      siret: ecoOrg.siret
    });
    const otherCompany = await companyFactory();
    const input = {
      waste: { adr: "xyz 33", code: "18 01 03*" },
      emitter: {
        company: {
          name: "hopital blanc",
          siret: otherCompany.siret,
          contact: "jean durand",
          phone: "06 18 76 02 00",

          address: "avenue de la mer"
        },
        emission: {
          weight: { value: 23.2, isEstimate: false },

          packagings: [
            {
              type: "BOITE_CARTON",
              volume: 22,
              quantity: 3
            }
          ]
        }
      },

      ecoOrganisme: { siret: ecoOrg.siret, name: "eco-org" }
    };

    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createBsdasri">>(
      CREATE_DASRI,
      {
        variables: {
          input
        }
      }
    );

    expect(data.createBsdasri.isDraft).toEqual(false);
    expect(data.createBsdasri.status).toEqual("INITIAL");
    expect(data.createBsdasri.type).toEqual("SIMPLE");

    expect(data.createBsdasri.ecoOrganisme.siret).toEqual(ecoOrg.siret);
  });
  it("create a dasri with an eco-organisme and an unregistered emitter(eco-org user)", async () => {
    const count = await prisma.company.count();
    const ecoOrg = await ecoOrganismeFactory({ count, handleBsdasri: true });
    const { user } = await userWithCompanyFactory("MEMBER", {
      siret: ecoOrg.siret
    });

    const input = {
      waste: { adr: "xyz 33", code: "18 01 03*" },
      emitter: {
        company: {
          name: "hopital blanc",
          siret: "51299999900099", // unregistered company
          contact: "jean durand",
          phone: "06 18 76 02 00",

          address: "avenue de la mer"
        },
        emission: {
          weight: { value: 23.2, isEstimate: false },

          packagings: [
            {
              type: "BOITE_CARTON",
              volume: 22,
              quantity: 3
            }
          ]
        }
      },

      ecoOrganisme: { siret: ecoOrg.siret, name: "eco-org" }
    };

    const { mutate } = makeClient(user);
    const { data } = await mutate<Pick<Mutation, "createBsdasri">>(
      CREATE_DASRI,
      {
        variables: {
          input
        }
      }
    );

    expect(data.createBsdasri.isDraft).toEqual(false);
    expect(data.createBsdasri.status).toEqual("INITIAL");
    expect(data.createBsdasri.type).toEqual("SIMPLE");

    expect(data.createBsdasri.ecoOrganisme.siret).toEqual(ecoOrg.siret);
    expect(data.createBsdasri.emitter.company.siret).toEqual("51299999900099");
  });
  it("create a dasri with an eco-organism (emitter user)", async () => {
    const count = await prisma.company.count();
    const ecoOrg = await ecoOrganismeFactory({ count, handleBsdasri: true });
    const { company: ecoOrgCompany } = await userWithCompanyFactory("MEMBER", {
      siret: ecoOrg.siret
    });
    const { user: emitterUser, company: otherCompany } =
      await userWithCompanyFactory("MEMBER");
    const input = {
      waste: { adr: "xyz 33", code: "18 01 03*" },
      emitter: {
        company: {
          name: "hopital blanc",
          siret: otherCompany.siret,
          contact: "jean durand",
          phone: "06 18 76 02 00",

          address: "avenue de la mer"
        },
        emission: {
          weight: { value: 23.2, isEstimate: false },

          packagings: [
            {
              type: "BOITE_CARTON",
              volume: 22,
              quantity: 3
            }
          ]
        }
      },

      ecoOrganisme: { siret: ecoOrgCompany.siret, name: "eco-org" }
    };

    const { mutate } = makeClient(emitterUser);
    const { data } = await mutate<Pick<Mutation, "createBsdasri">>(
      CREATE_DASRI,
      {
        variables: {
          input
        }
      }
    );

    expect(data.createBsdasri.isDraft).toEqual(false);
    expect(data.createBsdasri.status).toEqual("INITIAL");
    expect(data.createBsdasri.type).toEqual("SIMPLE");

    expect(data.createBsdasri.emitter.company.siret).toEqual(
      otherCompany.siret
    );
    expect(data.createBsdasri.ecoOrganisme.siret).toEqual(ecoOrg.siret);
  });
});
