import { BsffStatus, BsffType, UserRole } from "@prisma/client";
import { gql } from "apollo-server-core";
import { resetDatabase } from "../../../../../integration-tests/helper";
import {
  Mutation,
  MutationSignBsffArgs
} from "../../../../generated/graphql/types";
import prisma from "../../../../prisma";
import {
  UserWithCompany,
  userWithCompanyFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { OPERATION } from "../../../constants";
import {
  createBsffBeforeEmission,
  createBsffAfterEmission,
  createBsffBeforeTransport,
  createBsffBeforeReception,
  createBsffBeforeRefusal,
  createBsffAfterTransport,
  createBsffBeforeOperation,
  createBsffAfterOperation
} from "../../../__tests__/factories";

const SIGN = gql`
  mutation Sign($id: ID!, $input: BsffSignatureInput!) {
    signBsff(id: $id, input: $input) {
      id
    }
  }
`;

describe("Mutation.signBsff", () => {
  afterEach(resetDatabase);

  let emitter: UserWithCompany;
  let transporter: UserWithCompany;
  let destination: UserWithCompany;

  beforeEach(async () => {
    emitter = await userWithCompanyFactory(UserRole.ADMIN, {
      address: "12 rue de la Grue, 69000 Lyon",
      contactPhone: "06",
      contactEmail: "contact@gmail.com"
    });
    transporter = await userWithCompanyFactory(UserRole.ADMIN, {
      address: "12 rue de la Grue, 69000 Lyon",
      contactPhone: "06",
      contactEmail: "contact@gmail.com"
    });
    destination = await userWithCompanyFactory(UserRole.ADMIN, {
      address: "12 rue de la Grue, 69000 Lyon",
      contactPhone: "06",
      contactEmail: "contact@gmail.com"
    });
  });

  it("should disallow unauthenticated user from signing a bsff", async () => {
    const { mutate } = makeClient();
    const { errors } = await mutate<
      Pick<Mutation, "signBsff">,
      MutationSignBsffArgs
    >(SIGN, {
      variables: {
        id: "123",
        input: {
          type: "EMISSION",
          date: new Date().toISOString() as any,
          author: "Jeanne Dupont"
        }
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        extensions: {
          code: "UNAUTHENTICATED"
        }
      })
    ]);
  });

  it("should throw an error if the bsff being signed doesn't exist", async () => {
    const { mutate } = makeClient(emitter.user);
    const { errors } = await mutate<
      Pick<Mutation, "signBsff">,
      MutationSignBsffArgs
    >(SIGN, {
      variables: {
        id: "123",
        input: {
          type: "EMISSION",
          date: new Date().toISOString() as any,
          author: emitter.user.name
        }
      }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Le BSFF n°123 n'existe pas."
      })
    ]);
  });

  describe("EMISSION", () => {
    it("should allow emitter to sign", async () => {
      const bsff = await createBsffBeforeEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(emitter.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "EMISSION",
            date: new Date().toISOString() as any,
            author: emitter.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should allow the transporter to sign for the emitter with the security code", async () => {
      const bsff = await createBsffBeforeEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(transporter.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "EMISSION",
            date: new Date().toISOString() as any,
            author: emitter.user.name,
            securityCode: emitter.company.securityCode
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should disallow the transporter to sign for the emitter without the security code", async () => {
      const bsff = await createBsffBeforeEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(transporter.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "EMISSION",
            date: new Date().toISOString() as any,
            author: emitter.user.name
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          message: "Vous n'êtes pas autorisé à signer pour cet acteur."
        })
      ]);
    });

    it("should disallow the transporter to sign for the emitter with a wrong security code", async () => {
      const bsff = await createBsffBeforeEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(transporter.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "EMISSION",
            date: new Date().toISOString() as any,
            author: emitter.user.name,
            securityCode: 1
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          message: "Le code de sécurité est incorrect."
        })
      ]);
    });

    it("should throw an error when the emitter tries to sign twice", async () => {
      const bsff = await createBsffAfterEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(emitter.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "EMISSION",
            date: new Date().toISOString() as any,
            author: emitter.user.name
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          message: "L'entreprise émettrice a déjà signé ce bordereau"
        })
      ]);
    });

    it("should throw an error if the transporter tries to sign without the emitter's signature", async () => {
      const bsff = await createBsffBeforeTransport(
        { emitter, transporter, destination },
        {
          emitterEmissionSignatureDate: null,
          emitterEmissionSignatureAuthor: null
        }
      );

      const { mutate } = makeClient(transporter.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "TRANSPORT",
            date: new Date().toISOString() as any,
            author: transporter.user.name
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          message:
            "Le transporteur ne peut pas signer l'enlèvement avant que l'émetteur ait signé le bordereau"
        })
      ]);
    });
  });

  describe("TRANSPORT", () => {
    it("should allow transporter to sign transport", async () => {
      const bsff = await createBsffBeforeTransport({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(transporter.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "TRANSPORT",
            date: new Date().toISOString() as any,
            author: transporter.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should disallow transporter to sign transport when required data is missing", async () => {
      const bsff = await createBsffAfterEmission({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(transporter.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "TRANSPORT",
            date: new Date().toISOString() as any,
            author: transporter.user.name
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          extensions: {
            code: "BAD_USER_INPUT"
          }
        })
      ]);
    });
  });

  describe("RECEPTION", () => {
    it("should allow destination to sign reception", async () => {
      const bsff = await createBsffBeforeReception({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(destination.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "RECEPTION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });
  });

  describe("ACCEPTATION", () => {
    it("should allow destination to sign refusal", async () => {
      const bsff = await createBsffBeforeRefusal({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(destination.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "ACCEPTATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should disallow destination to sign acceptation when required data is missing", async () => {
      const bsff = await createBsffAfterTransport({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(destination.user);
      const { errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "ACCEPTATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toEqual([
        expect.objectContaining({
          extensions: {
            code: "BAD_USER_INPUT"
          }
        })
      ]);
    });

    it("should update status of previous BSFFs when refused", async () => {
      const ttr = await userWithCompanyFactory(UserRole.ADMIN);

      const bsff = await createBsffAfterOperation(
        { emitter, transporter, destination: ttr },
        {
          status: BsffStatus.INTERMEDIATELY_PROCESSED
        },
        { operationCode: OPERATION.R13.code }
      );

      const nextBsff = await createBsffBeforeRefusal({
        emitter: ttr,
        transporter,
        destination,
        previousPackagings: bsff.packagings
      });

      const { mutate } = makeClient(destination.user);
      await mutate<Pick<Mutation, "signBsff">, MutationSignBsffArgs>(SIGN, {
        variables: {
          id: nextBsff.id,
          input: {
            type: "ACCEPTATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      const updatedBsff = await prisma.bsff.findUnique({
        where: { id: bsff.id }
      });
      expect(updatedBsff.status).toEqual(BsffStatus.REFUSED);
    });
  });

  describe("OPERATION", () => {
    it("should allow destination to sign operation", async () => {
      const bsff = await createBsffBeforeOperation({
        emitter,
        transporter,
        destination
      });

      const { mutate } = makeClient(destination.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "OPERATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should allow signing a bsff for reexpedition", async () => {
      const bsff = await createBsffBeforeOperation(
        {
          emitter,
          transporter,
          destination
        },
        {},
        {
          operationCode: OPERATION.R13.code,
          operationNextDestinationCompanyName: "ACME INC",
          operationNextDestinationPlannedOperationCode: "R2",
          operationNextDestinationCap: "cap",
          operationNextDestinationCompanySiret: null,
          operationNextDestinationCompanyVatNumber: "IE9513674T",
          operationNextDestinationCompanyAddress: "Quelque part",
          operationNextDestinationCompanyContact: "Mr Déchet",
          operationNextDestinationCompanyPhone: "01 00 00 00 00",
          operationNextDestinationCompanyMail: "contact@trackdechets.fr"
        }
      );

      const { mutate } = makeClient(destination.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff.id,
          input: {
            type: "OPERATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();
    });

    it("should mark all BSFFs in the history as PROCESSED", async () => {
      const ttr1 = await userWithCompanyFactory(UserRole.ADMIN);
      const ttr2 = await userWithCompanyFactory(UserRole.ADMIN);

      const bsff1 = await createBsffAfterOperation(
        { emitter, transporter, destination: ttr1 },
        {
          status: BsffStatus.INTERMEDIATELY_PROCESSED
        },
        { operationCode: OPERATION.R13.code }
      );

      // bsff1 => bsff2
      const bsff2 = await createBsffAfterOperation(
        {
          emitter: ttr1,
          transporter,
          destination: ttr2,
          previousPackagings: bsff1.packagings
        },
        {
          type: BsffType.REEXPEDITION,
          status: BsffStatus.INTERMEDIATELY_PROCESSED
        },
        { operationCode: OPERATION.R13.code }
      );

      // bsff1 => bsff2 => bsff3
      const bsff3 = await createBsffBeforeOperation(
        {
          emitter: ttr2,
          transporter,
          destination,
          previousPackagings: bsff2.packagings
        },
        { type: BsffType.REEXPEDITION },
        { operationCode: OPERATION.R2.code }
      );

      const { mutate } = makeClient(destination.user);
      const { data, errors } = await mutate<
        Pick<Mutation, "signBsff">,
        MutationSignBsffArgs
      >(SIGN, {
        variables: {
          id: bsff3.id,
          input: {
            type: "OPERATION",
            date: new Date().toISOString() as any,
            author: destination.user.name
          }
        }
      });

      expect(errors).toBeUndefined();
      expect(data.signBsff.id).toBeTruthy();

      const newBsff1 = await prisma.bsff.findUnique({
        where: { id: bsff1.id }
      });
      expect(newBsff1.status).toEqual(BsffStatus.PROCESSED);

      const newBsff2 = await prisma.bsff.findUnique({
        where: { id: bsff2.id }
      });
      expect(newBsff2.status).toEqual(BsffStatus.PROCESSED);
    });
  });
});
