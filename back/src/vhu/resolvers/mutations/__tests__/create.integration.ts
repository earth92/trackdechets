import { resetDatabase } from "../../../../../integration-tests/helper";
import { ErrorCode } from "../../../../common/errors";
import {
  userFactory,
  userWithCompanyFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";

const CREATE_VHU_FORM = `
mutation CreateVhuForm($input: BsvhuInput!) {
  createBsvhu(input: $input) {
    id
    recipient {
      company {
          siret
      }
    }
    emitter {
      company {
          siret
      }
    }
    transporter {
      company {
        siret
        name
        address
        contact
        mail
        phone
      }
    }
    quantity {
      number
    }
  }
}
`;

describe("Mutation.Vhu.create", () => {
  afterEach(resetDatabase);

  it("should disallow unauthenticated user", async () => {
    const { mutate } = makeClient();
    const { errors } = await mutate(CREATE_VHU_FORM, {
      variables: { input: {} }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Vous n'êtes pas connecté.",
        extensions: expect.objectContaining({
          code: ErrorCode.UNAUTHENTICATED
        })
      })
    ]);
  });

  it("should disallow a user to create a form they are not part of", async () => {
    const user = await userFactory();

    const { mutate } = makeClient(user);
    const { errors } = await mutate(CREATE_VHU_FORM, {
      variables: {
        input: {
          emitter: {
            company: {
              siret: "siret"
            }
          }
        }
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message:
          "Vous ne pouvez pas créer un bordereau sur lequel votre entreprise n'apparait pas",
        extensions: expect.objectContaining({
          code: ErrorCode.FORBIDDEN
        })
      })
    ]);
  });

  it("should allow creating a valid form for the producer signature", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const input = {
      emitter: {
        company: {
          siret: company.siret,
          name: "The crusher",
          address: "Rue de la carcasse",
          contact: "Un centre VHU",
          phone: "0101010101",
          mail: "emitter@mail.com"
        },
        agrementNumber: "1234"
      },
      wasteCode: "16 01 06",
      packaging: "UNITE",
      identification: {
        numbers: ["123", "456"],
        type: "NUMERO_ORDRE_REGISTRE_POLICE"
      },
      quantity: {
        number: 2,
        tons: 1.3
      },
      recipient: {
        operation: {
          planned: "R 12"
        },
        company: {
          siret: "11111111111111",
          name: "recipient",
          address: "address",
          contact: "contactEmail",
          phone: "contactPhone",
          mail: "contactEmail@mail.com"
        }
      }
    };
    const { mutate } = makeClient(user);
    const { data } = await mutate(CREATE_VHU_FORM, {
      variables: {
        input
      }
    });

    expect(data.createBsvhu.id).toMatch(
      new RegExp(`^VHU-[0-9]{8}-[A-Z0-9]{9}$`)
    );
    expect(data.createBsvhu.recipient.company.siret).toBe(
      input.recipient.company.siret
    );
  });

  it("should fail if a required field like the emitter agrement is missing", async () => {
    const { user, company } = await userWithCompanyFactory("MEMBER");

    const input = {
      emitter: {
        company: {
          siret: company.siret,
          name: "The crusher",
          address: "Rue de la carcasse",
          contact: "Un centre VHU",
          phone: "0101010101",
          mail: "emitter@mail.com"
        }
      },
      wasteCode: "16 01 06",
      packaging: "UNITE",
      identification: {
        numbers: ["123", "456"],
        type: "NUMERO_ORDRE_REGISTRE_POLICE"
      },
      quantity: {
        number: 2,
        tons: 1.3
      },
      recipient: {
        operation: {
          planned: "R 12"
        },
        company: {
          siret: "11111111111111",
          name: "recipient",
          address: "address",
          contact: "contactEmail",
          phone: "contactPhone",
          mail: "contactEmail@mail.com"
        }
      }
    };
    const { mutate } = makeClient(user);
    const { errors } = await mutate(CREATE_VHU_FORM, {
      variables: {
        input
      }
    });

    expect(errors[0].message).toBe(
      "Émetteur: le numéro d'agréément est obligatoire"
    );
  });
});
