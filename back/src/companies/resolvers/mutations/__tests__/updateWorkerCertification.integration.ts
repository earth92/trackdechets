import { resetDatabase } from "../../../../../integration-tests/helper";
import prisma from "../../../../prisma";
import { AuthType } from "../../../../auth";
import { userWithCompanyFactory } from "../../../../__tests__/factories";
import makeClient from "../../../../__tests__/testClient";
import { Mutation } from "../../../../generated/graphql/types";

describe("{ mutation { updateworkerCertification } }", () => {
  afterEach(() => resetDatabase());

  it("should update a Worker certification", async () => {
    const certification = {
      hasSubSectionFour: true,
      hasSubSectionThree: true,
      certificationNumber: "AAA",
      validityLimit: new Date().toISOString(),
      organisation: "AFNOR Certification"
    };

    const createdCertification = await prisma.workerCertification.create({
      data: certification
    });
    const { user, company } = await userWithCompanyFactory("ADMIN");
    await prisma.company.update({
      data: {
        workerCertification: { connect: { id: createdCertification.id } }
      },
      where: { id: company.id }
    });

    const update = {
      certificationNumber: "BBB"
    };

    const mutation = `
      mutation {
        updateWorkerCertification(
          input: {
            id: "${createdCertification.id}"
            certificationNumber: "${update.certificationNumber}"
          }
          ) { certificationNumber }
        }`;
    const { mutate } = makeClient({ ...user, auth: AuthType.Session });

    const { data } = await mutate<Pick<Mutation, "updateWorkerCertification">>(
      mutation
    );

    // check returned value
    expect(data.updateWorkerCertification).toEqual(update);

    // check record was modified in db
    const { id, ...updated } = await prisma.workerCertification.findUnique({
      where: { id: createdCertification.id }
    });
    expect(updated.certificationNumber).toEqual(update.certificationNumber);
  });
});
