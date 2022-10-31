import {
  Form,
  Bsda,
  Bsdasri,
  BsdaStatus,
  BsdasriStatus,
  Bsff,
  Bsvhu,
  BsvhuStatus,
  Company,
  Status,
  User,
  UserRole
} from "@prisma/client";
import {
  refreshElasticSearch,
  resetDatabase
} from "../../../../../integration-tests/helper";
import { indexBsda } from "../../../../bsda/elastic";
import { bsdaFactory } from "../../../../bsda/__tests__/factories";
import { indexBsdasri } from "../../../../bsdasris/elastic";
import { bsdasriFactory } from "../../../../bsdasris/__tests__/factories";
import { indexBsff } from "../../../../bsffs/elastic";
import { createBsffAfterOperation } from "../../../../bsffs/__tests__/factories";
import { indexBsvhu } from "../../../../bsvhu/elastic";
import { bsvhuFactory } from "../../../../bsvhu/__tests__/factories.vhu";
import { getFullForm } from "../../../../forms/database";
import { indexForm } from "../../../../forms/elastic";
import { Query } from "../../../../generated/graphql/types";
import {
  formFactory,
  userFactory,
  userWithCompanyFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { OUTGOING_WASTES } from "./queries";

describe("Outgoing wastes registry", () => {
  let emitter: { user: User; company: Company };
  let emitter2: { user: User; company: Company };
  let transporter: { user: User; company: Company };
  let destination: { user: User; company: Company };
  let bsd1: Form;
  let bsd2: Bsda;
  let bsd3: Bsdasri;
  let bsd4: Bsvhu;
  let bsd5: Bsff;

  beforeAll(async () => {
    emitter = await userWithCompanyFactory(UserRole.ADMIN, {
      companyTypes: {
        set: ["PRODUCER"]
      }
    });
    emitter2 = await userWithCompanyFactory(UserRole.ADMIN, {
      companyTypes: {
        set: ["PRODUCER"]
      }
    });
    transporter = await userWithCompanyFactory(UserRole.ADMIN, {
      companyTypes: {
        set: ["TRANSPORTER"]
      }
    });

    destination = await userWithCompanyFactory(UserRole.ADMIN, {
      companyTypes: {
        set: ["WASTEPROCESSOR"]
      }
    });

    bsd1 = await formFactory({
      ownerId: emitter.user.id,
      opt: {
        emitterCompanySiret: emitter.company.siret,
        transporterCompanySiret: transporter.company.siret,
        recipientCompanySiret: destination.company.siret,
        wasteDetailsCode: "05 01 02*",
        status: Status.PROCESSED,
        quantityReceived: 1000,
        createdAt: new Date("2021-04-01"),
        sentAt: new Date("2021-04-01"),
        receivedAt: new Date("2021-04-01"),
        processedAt: new Date("2021-04-01"),
        processingOperationDone: "R 1"
      }
    });
    bsd2 = await bsdaFactory({
      opt: {
        emitterCompanySiret: emitter.company.siret,
        transporterCompanySiret: transporter.company.siret,
        destinationCompanySiret: destination.company.siret,
        wasteCode: "08 01 17*",
        status: BsdaStatus.PROCESSED,
        createdAt: new Date("2021-05-01"),
        destinationReceptionWeight: 500,
        emitterEmissionSignatureDate: new Date("2021-05-01"),
        transporterTransportSignatureDate: new Date("2021-05-01"),
        transporterTransportTakenOverAt: new Date("2021-05-01"),
        destinationReceptionDate: new Date("2021-05-01"),
        destinationOperationDate: new Date("2021-05-01"),
        destinationOperationCode: "D 5"
      }
    });
    bsd3 = await bsdasriFactory({
      opt: {
        emitterCompanySiret: emitter.company.siret,
        transporterCompanySiret: transporter.company.siret,
        destinationCompanySiret: destination.company.siret,
        wasteCode: "18 01 03*",
        status: BsdasriStatus.PROCESSED,
        createdAt: new Date("2021-06-01"),
        destinationReceptionWasteWeightValue: 10,
        emitterEmissionSignatureDate: new Date("2021-06-01"),
        transporterTransportSignatureDate: new Date("2021-06-01"),
        transporterTakenOverAt: new Date("2021-06-01"),
        destinationReceptionDate: new Date("2021-06-01"),
        destinationOperationDate: new Date("2021-06-01"),
        destinationOperationCode: "R 13"
      }
    });
    bsd4 = await bsvhuFactory({
      opt: {
        emitterCompanySiret: emitter.company.siret,
        transporterCompanySiret: transporter.company.siret,
        destinationCompanySiret: destination.company.siret,
        wasteCode: "16 01 04*",
        status: BsvhuStatus.PROCESSED,
        createdAt: new Date("2021-07-01"),
        destinationReceptionWeight: 3000,
        emitterEmissionSignatureDate: new Date("2021-07-01"),
        transporterTransportSignatureDate: new Date("2021-07-01"),
        transporterTransportTakenOverAt: new Date("2021-07-01"),
        destinationReceptionDate: new Date("2021-07-01"),
        destinationOperationDate: new Date("2021-07-01"),
        destinationOperationCode: "R 8"
      }
    });
    bsd5 = await createBsffAfterOperation(
      {
        emitter,
        transporter,
        destination
      },
      {
        wasteCode: "14 06 01*",
        destinationReceptionWeight: 200,
        createdAt: new Date("2021-08-01"),
        emitterEmissionSignatureDate: new Date("2021-08-01"),
        transporterTransportSignatureDate: new Date("2021-08-01"),
        transporterTransportTakenOverAt: new Date("2021-08-01"),
        destinationReceptionDate: new Date("2021-08-01"),
        destinationOperationSignatureDate: new Date("2021-08-01"),
        destinationOperationCode: "R 2"
      }
    );

    await Promise.all([
      indexForm(await getFullForm(bsd1)),
      indexBsda(bsd2),
      indexBsdasri(bsd3),
      indexBsvhu(bsd4),
      indexBsff(bsd5)
    ]);
    await refreshElasticSearch();
  });
  afterAll(resetDatabase);

  it("should return an error if the user is not authenticated", async () => {
    const { query } = makeClient();
    const { errors } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret]
        }
      }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(
      expect.objectContaining({
        message: "Vous n'êtes pas connecté."
      })
    );
  });

  it("should return an error when querying a SIRET the user is not member of", async () => {
    const { query } = makeClient(emitter.user);
    const { errors } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter2.company.siret]
        }
      }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(
      expect.objectContaining({
        message: `Vous n'êtes pas membre de l'entreprise portant le siret "${emitter2.company.siret}".`
      })
    );
  });

  it("should allow user to request any siret if authenticated from a service account", async () => {
    const user = await userFactory({ isRegistreNational: true });
    const { query } = makeClient(user);
    const { data } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret],
          first: 2
        }
      }
    );
    expect(data.outgoingWastes.edges).toHaveLength(2);
  });

  it("should paginate forward with first and after", async () => {
    const { query } = makeClient(emitter.user);
    const { data: page1 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: { sirets: [emitter.company.siret], first: 2 }
      }
    );
    let ids = page1.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd1.readableId, bsd2.id]);
    expect(page1.outgoingWastes.totalCount).toEqual(5);
    expect(page1.outgoingWastes.pageInfo.endCursor).toEqual(bsd2.id);
    expect(page1.outgoingWastes.pageInfo.hasNextPage).toEqual(true);

    const { data: page2 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret],
          first: 2,
          after: page1.outgoingWastes.pageInfo.endCursor
        }
      }
    );

    ids = page2.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd3.id, bsd4.id]);
    expect(page2.outgoingWastes.totalCount).toEqual(5);
    expect(page2.outgoingWastes.pageInfo.endCursor).toEqual(bsd4.id);
    expect(page2.outgoingWastes.pageInfo.hasNextPage).toEqual(true);

    const { data: page3 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret],
          first: 2,
          after: page2.outgoingWastes.pageInfo.endCursor
        }
      }
    );
    ids = page3.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd5.id]);
    expect(page3.outgoingWastes.totalCount).toEqual(5);
    expect(page3.outgoingWastes.pageInfo.endCursor).toEqual(bsd5.id);
    expect(page3.outgoingWastes.pageInfo.hasNextPage).toEqual(false);
  });

  it("should paginate backward with last and before", async () => {
    const { query } = makeClient(emitter.user);
    const { data: page1 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: { sirets: [emitter.company.siret], last: 2 }
      }
    );
    let ids = page1.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd4.id, bsd5.id]);
    expect(page1.outgoingWastes.totalCount).toEqual(5);
    expect(page1.outgoingWastes.pageInfo.startCursor).toEqual(bsd4.id);
    expect(page1.outgoingWastes.pageInfo.hasPreviousPage).toEqual(true);

    const { data: page2 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret],
          last: 2,
          before: page1.outgoingWastes.pageInfo.startCursor
        }
      }
    );
    ids = page2.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd2.id, bsd3.id]);
    expect(page2.outgoingWastes.totalCount).toEqual(5);
    expect(page2.outgoingWastes.pageInfo.startCursor).toEqual(bsd2.id);
    expect(page2.outgoingWastes.pageInfo.hasPreviousPage).toEqual(true);

    const { data: page3 } = await query<Pick<Query, "outgoingWastes">>(
      OUTGOING_WASTES,
      {
        variables: {
          sirets: [emitter.company.siret],
          last: 2,
          before: page2.outgoingWastes.pageInfo.startCursor
        }
      }
    );
    ids = page3.outgoingWastes.edges.map(edge => edge.node.id);
    expect(ids).toEqual([bsd1.readableId]);
    expect(page3.outgoingWastes.totalCount).toEqual(5);
    expect(page3.outgoingWastes.pageInfo.startCursor).toEqual(bsd1.id);
    expect(page3.outgoingWastes.pageInfo.hasPreviousPage).toEqual(false);
  });
});
