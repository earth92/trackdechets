import { BsffType, UserRole } from "@prisma/client";
import { gql } from "apollo-server-core";
import { resetDatabase } from "../../../../../integration-tests/helper";
import {
  Query,
  QueryBsffPackagingArgs
} from "../../../../generated/graphql/types";
import {
  userFactory,
  userWithCompanyFactory
} from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { createBsff } from "../../../__tests__/factories";

const GET_BSFF_PACKAGING = gql`
  query GetBsffPackging($id: ID!) {
    bsffPackaging(id: $id) {
      id
      numero
      bsff {
        id
      }
      previousBsffs {
        id
      }
      nextBsffs {
        id
      }
    }
  }
`;

describe("Query.bsffPackaging", () => {
  afterEach(resetDatabase);

  it("should return the detail of a bsff packaging", async () => {
    const emitter = await userWithCompanyFactory(UserRole.MEMBER);

    const bsff = await createBsff({ emitter });
    const packaging = bsff.packagings[0];

    const { query } = makeClient(emitter.user);

    const { data } = await query<
      Pick<Query, "bsffPackaging">,
      QueryBsffPackagingArgs
    >(GET_BSFF_PACKAGING, {
      variables: { id: packaging.id }
    });

    expect(data.bsffPackaging.id).toEqual(packaging.id);
    expect(data.bsffPackaging.numero).toEqual(packaging.numero);
    expect(data.bsffPackaging.previousBsffs).toEqual([]);
    expect(data.bsffPackaging.nextBsffs).toEqual([]);
  });

  it("should return previous and next bsffs", async () => {
    const emitter1 = await userWithCompanyFactory(UserRole.MEMBER);
    const destination1 = await userWithCompanyFactory(UserRole.MEMBER);
    const destination2 = await userWithCompanyFactory(UserRole.MEMBER);

    const bsff1 = await createBsff(
      { emitter: emitter1, destination: destination1 },
      { id: "bsff1" }
    );

    // bsff2 is forwarding bsff1
    const bsff2 = await createBsff(
      {
        emitter: destination1,
        destination: destination2,
        previousPackagings: bsff1.packagings
      },
      { id: "bsff2", type: BsffType.REEXPEDITION }
    );

    const bsff3 = await createBsff({}, { id: "bsff3" });
    // bsff4 is repackaging bsff2 and bsff3
    const bsff4 = await createBsff(
      {
        emitter: destination2,
        previousPackagings: [...bsff2.packagings, ...bsff3.packagings]
      },
      {
        id: "bsff4",
        type: BsffType.RECONDITIONNEMENT
      }
    );
    const bsff5 = await createBsff({}, { id: "bsff5" });
    // bsff6 is grouping bsff5 and bsff4
    const bsff6 = await createBsff(
      {
        previousPackagings: [...bsff4.packagings, ...bsff5.packagings]
      },
      {
        id: "bsff6",
        type: BsffType.GROUPEMENT
      }
    );

    const { query } = makeClient(destination2.user);
    const { data } = await query<
      Pick<Query, "bsffPackaging">,
      QueryBsffPackagingArgs
    >(GET_BSFF_PACKAGING, {
      variables: { id: bsff4.packagings[0].id }
    });

    expect(data.bsffPackaging.previousBsffs).toEqual([
      { id: bsff1.id },
      { id: bsff2.id },
      { id: bsff3.id }
    ]);

    expect(data.bsffPackaging.nextBsffs).toEqual([{ id: bsff6.id }]);
  });

  it("should throw exception if user is not bsff contributor", async () => {
    const emitter = await userWithCompanyFactory(UserRole.MEMBER);
    const user = await userFactory();

    const bsff = await createBsff({ emitter });
    const packaging = bsff.packagings[0];

    const { query } = makeClient(user);

    const { errors } = await query<
      Pick<Query, "bsffPackaging">,
      QueryBsffPackagingArgs
    >(GET_BSFF_PACKAGING, {
      variables: { id: packaging.id }
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Vous ne pouvez pas accéder à ce BSFF"
      })
    ]);
  });
});
